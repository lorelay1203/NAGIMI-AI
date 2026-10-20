// GET /api/tradingview/linea?ticker=SPY[&muros=propios]
//
// La línea de texto para pegar en el script "Nagimi Flow Pro" de TradingView:
// muros de GEX (en SPY/QQQ, los del índice pasados al ETF), tipo de día, perfil
// por strike y hacia dónde va el dinero de opciones hoy.

import { armarLineaDeTicker } from "@/lib/lineaServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });
  const propios = searchParams.get("muros") === "propios";

  try {
    const r = await armarLineaDeTicker(ticker, propios);
    return Response.json({
      linea: r.linea,
      ticker,
      espejoDe: r.espejoDe,
      avisoEspejo: r.avisoEspejo,
      fuente: r.fuente,
      flujoAlcistaPct: r.datos.flujoAlcistaPct,
      asOf: r.asOf,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo armar la línea." },
      { status: 502 },
    );
  }
}
