// GET /api/daygex?ticker=XXX
// Niveles de GEX del día (call/put wall, imán, gamma flip) desde MarketSnack o
// Massive (lo que responda), + ideas de day-trade derivadas de esos niveles.

import { getDayGex } from "@/lib/dayGex";
import { dayTradeIdeas } from "@/lib/dayTradeIdeas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // la cadena de Massive puede tardar

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const levels = await getDayGex(ticker);
    const ideas = dayTradeIdeas(levels);
    return Response.json({ levels, ideas });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el GEX." },
      { status: 502 },
    );
  }
}
