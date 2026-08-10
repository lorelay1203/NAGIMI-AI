// GET /api/contract?ticker=X&type=call|put&strike=90&expiration=2026-08-15
//   → detalle COMPLETO del contrato: griegos reales (delta/gamma/theta/vega),
//     precio, bid/ask/mid, IV, volumen y open interest. Para corroborar trades.

import { contractDetail, MsChainError } from "@/lib/marketsnackChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const type = searchParams.get("type") === "put" ? "put" : "call";
  const strike = Number(searchParams.get("strike")) || 0;
  const expiration = (searchParams.get("expiration") ?? "").trim();
  if (!ticker || !strike || !expiration) return Response.json({ error: "faltan parámetros" }, { status: 400 });
  try {
    const d = await contractDetail(ticker, type, strike, expiration);
    if (!d) return Response.json({ error: "Contrato no encontrado en la cadena." }, { status: 404 });
    return Response.json(d);
  } catch (err) {
    const msg = err instanceof MsChainError ? err.message : "Error al traer el detalle.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
