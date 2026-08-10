// GET /api/gex?ticker=XXX — niveles de GEX (call/put wall, imán, gamma flip) desde MarketSnack.

import { fetchMsGex, MsGexError } from "@/lib/marketsnackGex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const r = await fetchMsGex(ticker);
    return Response.json(r);
  } catch (err) {
    const message = err instanceof MsGexError ? err.message : "Error al cargar GEX de MarketSnack.";
    return Response.json({ error: message }, { status: 502 });
  }
}
