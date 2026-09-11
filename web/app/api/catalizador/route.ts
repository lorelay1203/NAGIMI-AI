// GET /api/catalizador?ticker=NVDA → el próximo earnings y su lectura de IV
// crush. Fecha REAL de Finnhub. Si es un ETF/índice que no reporta, o no hay
// dato, devuelve { catalizador: null } — no se inventa.

import { fetchNextEarnings } from "@/lib/finnhub";
import { buildCatalizador } from "@/lib/catalizador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });

  try {
    const earnings = await fetchNextEarnings(ticker);
    return Response.json({ catalizador: buildCatalizador(earnings) });
  } catch {
    return Response.json({ catalizador: null });
  }
}
