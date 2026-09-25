// GET /api/mapa-gex?ticker=QQQ — la proyección en tres escenarios (Mapa GEX).
//
// Junta lo que ya calcula Nagimi:
//   · los muros de dinero de opciones del día (getDayGex),
//   · hacia dónde está entrando el dinero con prisa (MarketSnack),
//   · el ambiente: bonos largos (TLT), dólar (UUP) y el VIX.
// y se lo pasa a lib/mapaGex.ts, que arma el texto.
//
// Cada pieza que falle se manda vacía: el mapa lo dice en vez de inventarla.

import { getDayGex } from "@/lib/dayGex";
import { mapaGex } from "@/lib/mapaGex";
import { cachedDailyBars } from "@/lib/barsStore";
import { cambioPct } from "@/lib/agenteMacro";
import { fetchFlow } from "@/lib/marketsnack";
import { classifyFlow } from "@/lib/flow";
import { analyzeMarketPressure } from "@/lib/marketPressure";
import { fetchSchwabDailyCloses, fetchSchwabQuote } from "@/lib/schwabMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Parte del dinero agresivo que apuesta a que sube (0-1), o null. */
async function flujoAlcista(ticker: string): Promise<number | null> {
  try {
    const { trades } = await fetchFlow(ticker, { period: "1d", minPremium: 25_000, maxPages: 6 });
    const { rows } = classifyFlow(trades, new Date());
    if (rows.length === 0) return null;
    const p = analyzeMarketPressure(rows);
    const bull = p.cross.callsBought + p.cross.putsSold;
    const bear = p.cross.callsSold + p.cross.putsBought;
    return bull + bear > 0 ? bull / (bull + bear) : null;
  } catch {
    return null;
  }
}

async function cambio5d(ticker: string, ahora: Date): Promise<number | null> {
  const velas = await cachedDailyBars(ticker, 30, ahora).catch(() => []);
  return cambioPct(velas.map((v) => v.close), 5);
}

async function vix(): Promise<{ nivel: number | null; cambio: number | null }> {
  const [nivel, cierres] = await Promise.all([
    fetchSchwabQuote("VIX").catch(() => null),
    fetchSchwabDailyCloses("VIX", 10).catch(() => [] as number[]),
  ]);
  return { nivel, cambio: cambioPct(cierres, 5) };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const ahora = new Date();

  try {
    const [niveles, flujo, bonos5d, dolar5d, v] = await Promise.all([
      getDayGex(ticker),
      flujoAlcista(ticker),
      cambio5d("TLT", ahora),
      cambio5d("UUP", ahora),
      vix(),
    ]);

    const mapa = mapaGex({
      ticker,
      spot: niveles.spot,
      regime: niveles.regime,
      callWall: niveles.callWall,
      putWall: niveles.putWall,
      magnet: niveles.magnet,
      gammaFlip: niveles.gammaFlip,
      maxPain: niveles.maxPain,
      bars: niveles.bars,
      flujoAlcista: flujo,
      macro: { bonos5d, dolar5d, vix: v.nivel, vix5d: v.cambio },
    });

    return Response.json({
      mapa,
      fuente: niveles.source,
      asOf: niveles.asOf,
      flujoLeido: flujo != null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo armar el mapa." },
      { status: 502 },
    );
  }
}
