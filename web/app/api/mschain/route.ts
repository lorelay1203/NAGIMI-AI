// GET /api/mschain?ticker=XXX — GEX por strike con gamma REAL desde MarketSnack.

import { fetchMsChainGex, MsChainError } from "@/lib/marketsnackChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const r = await fetchMsChainGex(ticker);
    return Response.json(r);
  } catch (err) {
    const message = err instanceof MsChainError ? err.message : "Error al cargar cadena de MarketSnack.";
    return Response.json({ error: message }, { status: 502 });
  }
}
