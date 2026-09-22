// GET /api/proyeccion?ticker=NVDA&dias=20
//
// La "proyección" de un ticker a un horizonte: escenarios bajista / base /
// alcista con su probabilidad, el cono de movimiento esperado y los niveles
// con más peso. Es el motor que ya usa el Panel (predictPro), pero servido
// aparte para la página de Proyecciones, sin necesitar el escaneo de flujo.
//
// De dónde sale cada cosa:
//   · muros y perfil por strike → getDayGex (MarketSnack → Schwab → Massive)
//   · si la fuente no da el perfil por strike (MarketSnack), se pide la cadena
//     por strike aparte; sin perfil no hay imán y no hay proyección.

import { getDayGex } from "@/lib/dayGex";
import { fetchMsChainGex } from "@/lib/marketsnackChain";
import { predictPro } from "@/lib/prediction";
import { expectedMove } from "@/lib/expectedMove";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Horizontes que ofrece la página, en días. */
const DIAS_VALIDOS = [10, 20, 30];

interface Nodo { strike: number; concentration: number; side: "call" | "put"; netGex: number }

/** De un perfil por strike a los nodos que espera predictPro. */
function nodosDe(bars: { strike: number; callGex: number; putGex: number; netGex: number }[]): Nodo[] {
  const total = bars.reduce((s, b) => s + Math.abs(b.netGex), 0);
  if (!(total > 0)) return [];
  return bars.map((b) => ({
    strike: b.strike,
    concentration: Math.abs(b.netGex) / total,
    side: b.callGex >= b.putGex ? "call" : "put",
    netGex: b.netGex,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const dias = Number(searchParams.get("dias") ?? "20");
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const horizonDays = DIAS_VALIDOS.includes(dias) ? dias : 20;

  try {
    const levels = await getDayGex(ticker);
    let bars = levels.bars;
    let iv = levels.iv;
    let spot = levels.spot;

    // MarketSnack da los muros pero no el perfil por strike: se pide aparte.
    if (bars.length === 0 || iv == null) {
      const chain = await fetchMsChainGex(ticker).catch(() => null);
      if (chain && chain.strikes.length > 0) {
        bars = chain.strikes.map((s) => ({
          strike: s.strike, callGex: s.callGex, putGex: s.putGex, netGex: s.netGex,
        }));
        iv = iv ?? chain.iv;
        if (!(spot > 0)) spot = chain.spot;
      }
    }

    const nodes = nodosDe(bars);
    if (nodes.length === 0 || !(spot > 0)) {
      return Response.json(
        { error: `No hay perfil de gamma por strike para ${ticker} ahora mismo.` },
        { status: 502 },
      );
    }

    const ivUsada = iv && iv > 0 ? iv : 0.35; // sin IV de la cadena, una razonable
    const prediction = predictPro({
      spot,
      iv: ivUsada,
      horizonDays,
      nodes,
      // Esta página no corre el escaneo de flujo: los sub-agentes van vacíos y
      // la confianza sale recortada a propósito (se dice en la UI).
      scores: { aggression: null, conviction: null, unusuality: null, structure: null, ivContext: null, validation: null },
      regime: levels.regime,
      callPct: null,
      hitRate: null,
      lowLiquidity: false,
    });

    const em = expectedMove(spot, ivUsada, horizonDays);

    return Response.json({
      ticker,
      horizonDays,
      spot,
      iv: ivUsada,
      ivFuente: iv && iv > 0 ? "cadena" : "estimada",
      fuente: levels.source,
      regimen: levels.regime,
      callWall: levels.callWall,
      putWall: levels.putWall,
      magnet: levels.magnet,
      gammaFlip: levels.gammaFlip,
      maxPain: levels.maxPain,
      sigmaPct: em.sigmaPct,
      cono: { abajo2: em.lower2, abajo1: em.lower1, arriba1: em.upper1, arriba2: em.upper2 },
      prediction,
      asOf: levels.asOf,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo armar la proyección." },
      { status: 502 },
    );
  }
}
