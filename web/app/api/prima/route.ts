// GET /api/prima?ticker=SPX&capital=900[&source=marketsnack|schwab][&muros=propios]
//
// Venta de prima 0DTE con riesgo topado. Usa los mismos muros de gamma que el
// resto de Nagimi y la misma cadena que el ticket, pero al revés: en vez de
// comprar la vuelta al imán, cobra por el tiempo más allá del muro.
// En SPY y QQQ los muros salen del índice (SPX / NDX), salvo ?muros=propios.

import { armarPlanPrima } from "@/lib/primaPlan";
import type { TicketChainSource } from "@/lib/ticketChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const capital = Number(searchParams.get("capital") ?? "0");
  const source = (searchParams.get("source") ?? undefined) as TicketChainSource | undefined;
  const propios = searchParams.get("muros") === "propios";

  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });
  if (!(capital > 0)) return Response.json({ error: "Falta el capital disponible." }, { status: 400 });

  try {
    return Response.json(await armarPlanPrima(ticker, capital, { propios, source }));
  } catch (e) {
    const msg = e instanceof Error && e.message.startsWith("No se pudo") ? e.message : "No se pudo armar el plan de prima.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
