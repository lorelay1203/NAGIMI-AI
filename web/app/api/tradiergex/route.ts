// GET /api/tradiergex?ticker=XXX — GEX por strike con gamma REAL desde Tradier (respaldo).

import { fetchTradierChainGex, TradierError } from "@/lib/tradier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const r = await fetchTradierChainGex(ticker);
    return Response.json(r);
  } catch (err) {
    const message = err instanceof TradierError ? err.message : "Error al cargar cadena de Tradier.";
    return Response.json({ error: message }, { status: 502 });
  }
}
