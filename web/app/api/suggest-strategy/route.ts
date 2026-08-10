// GET /api/suggest-strategy?ticker=X&strategy=vertical&type=call&budget=N
// Sugiere strike central + ancho + vencimiento para que la estrategia quepa en la cuenta.

import { suggestStrategy, MsChainError } from "@/lib/marketsnackChain";
import type { Strategy } from "@/lib/orderBuilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: Strategy[] = ["single", "vertical", "credit", "butterfly", "condor", "iron_condor"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const stratRaw = (searchParams.get("strategy") ?? "single") as Strategy;
  const strategy: Strategy = VALID.includes(stratRaw) ? stratRaw : "single";
  const type = searchParams.get("type") === "put" ? "put" : "call";
  const budget = Number(searchParams.get("budget")) || 0;
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const s = await suggestStrategy(ticker, strategy, type, budget);
    if (!s) return Response.json({ error: "Ninguna versión cabe en tu presupuesto. Sube el tamaño o cambia la estrategia." }, { status: 404 });
    return Response.json(s);
  } catch (err) {
    const msg = err instanceof MsChainError ? err.message : "Error al sugerir la estrategia.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
