// GET /api/suggest?ticker=X&type=call|put&budget=N — sugiere un contrato asequible
// (strike + vencimiento) con su bid/ask/mid, según el tamaño de cuenta.

import { suggestContract, MsChainError } from "@/lib/marketsnackChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const type = searchParams.get("type") === "put" ? "put" : "call";
  const budget = Number(searchParams.get("budget")) || 0;
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const s = await suggestContract(ticker, type, budget);
    if (!s) return Response.json({ error: "Ningún contrato cabe en ese presupuesto. Sube el tamaño o cambia el tipo." }, { status: 404 });
    return Response.json(s);
  } catch (err) {
    const msg = err instanceof MsChainError ? err.message : "Error al sugerir contrato.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
