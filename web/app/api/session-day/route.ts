// GET /api/session-day?ticker=XXX — "la sesión de hoy": niveles intradía + canal
// de gamma + veredicto de sesión. El flujo/prints se añade con MarketSnack aparte.

import { getDaySession } from "@/lib/sessionDay";
import { dayTradeIdeas } from "@/lib/dayTradeIdeas";
import { getDayGex } from "@/lib/dayGex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  try {
    const session = await getDaySession(ticker);
    // Ideas de day-trade reusando los muros ya calculados.
    const levels = await getDayGex(ticker);
    const ideas = dayTradeIdeas(levels);
    return Response.json({ session, ideas });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo cargar la sesión." },
      { status: 502 },
    );
  }
}
