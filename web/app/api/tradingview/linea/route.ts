// GET /api/tradingview/linea?ticker=SPY[&muros=propios]
//
// La línea de texto para pegar en el script "Nagimi Flow Pro" de TradingView:
// muros de GEX (en SPY/QQQ, los del índice pasados al ETF), tipo de día, perfil
// por strike y hacia dónde va el dinero de opciones hoy.

import { nivelesConEspejo } from "@/lib/nivelesEspejoServidor";
import { getDayGex } from "@/lib/dayGex";
import { flowContext } from "@/lib/flowContext";
import { armarLineaTradingView, fechaNY } from "@/lib/lineaTradingView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });
  const propios = searchParams.get("muros") === "propios";

  try {
    const [{ levels, avisoEspejo }, flujo] = await Promise.all([
      nivelesConEspejo(ticker, propios),
      flowContext(ticker).catch(() => null),
    ]);

    // El perfil por strike: MarketSnack da los muros ya calculados pero no las
    // barras; si faltan, se piden a Schwab (del índice si los muros son espejo,
    // pasando los strikes a precios del ETF con la misma proporción).
    let bars = levels.bars.map((b) => ({ strike: b.strike, netGex: b.netGex }));
    if (bars.length === 0) {
      const base = levels.espejo?.indice ?? ticker;
      const k = levels.espejo?.ratio ?? 1;
      const sch = await getDayGex(base, "schwab").catch(() => null);
      if (sch) bars = sch.bars.map((b) => ({ strike: Math.round(b.strike * k * 100) / 100, netGex: b.netGex }));
    }

    const bull = flujo?.ctx.bull ?? 0;
    const bear = flujo?.ctx.bear ?? 0;
    const flujoAlcistaPct = bull + bear > 0 ? (bull / (bull + bear)) * 100 : null;

    const linea = armarLineaTradingView({
      ticker,
      fecha: fechaNY(new Date()),
      spot: levels.spot,
      callWall: levels.callWall,
      putWall: levels.putWall,
      magnet: levels.magnet,
      gammaFlip: levels.gammaFlip,
      regime: levels.regime,
      flujoAlcistaPct,
      bars,
    });

    return Response.json({
      linea,
      ticker,
      espejoDe: levels.espejo?.indice ?? null,
      avisoEspejo,
      fuente: levels.source,
      flujoAlcistaPct,
      asOf: levels.asOf,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo armar la línea." },
      { status: 502 },
    );
  }
}
