// GET /api/history?ticker=XXX — barras diarias del subyacente para la gráfica.
//
// Usa el cache por día de mercado con reintentos (barsStore): Massive a veces
// devuelve vacío cuando el panel le hace varios pedidos a la vez, y sin estas
// barras no hay GEX ni veredicto.

import { cachedDailyBars } from "@/lib/barsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) {
    return Response.json({ error: "ticker requerido" }, { status: 400 });
  }
  try {
    const bars = await cachedDailyBars(ticker);
    return Response.json({ ticker, bars });
  } catch {
    return Response.json({ error: "Error al cargar histórico." }, { status: 502 });
  }
}
