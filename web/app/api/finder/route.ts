// GET /api/finder?ticker=X&budget=N — "¿qué hago con $N en X?"
// Devuelve las estrategias que CABEN en el presupuesto y las que no.

import { findStrategies } from "@/lib/strategyFinder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const budget = Number(searchParams.get("budget")) || 0;
  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });
  if (!(budget > 0)) return Response.json({ error: "El presupuesto debe ser mayor que 0." }, { status: 400 });

  try {
    const result = await findStrategies(ticker, budget);
    if ("error" in result) return Response.json(result, { status: 502 });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error al buscar estrategias." }, { status: 500 });
  }
}
