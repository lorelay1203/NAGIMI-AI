// GET /api/prima?ticker=SPX&capital=900[&source=marketsnack|schwab]
//
// Venta de prima 0DTE con riesgo topado. Usa los mismos muros de gamma que el
// resto de Nagimi y la misma cadena que el ticket, pero al revés: en vez de
// comprar la vuelta al imán, cobra por el tiempo más allá del muro.

import { getDayGex } from "@/lib/dayGex";
import { getTicketChain, type TicketChainSource } from "@/lib/ticketChain";
import { buildCreditPlan, elegirSpot } from "@/lib/creditSpread0dte";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const capital = Number(searchParams.get("capital") ?? "0");
  const source = (searchParams.get("source") ?? undefined) as TicketChainSource | undefined;

  if (!ticker) return Response.json({ error: "Falta el ticker." }, { status: 400 });
  if (!(capital > 0)) return Response.json({ error: "Falta el capital disponible." }, { status: 400 });

  try {
    const [levels, chain] = await Promise.all([
      getDayGex(ticker),
      getTicketChain(ticker, source),
    ]);

    if (!levels || !(levels.spot > 0)) {
      return Response.json({ error: `No se pudieron leer los niveles de ${ticker}.` }, { status: 502 });
    }
    if (chain.rows.length === 0) {
      return Response.json({ error: `No se pudo leer la cadena de ${ticker}.` }, { status: 502 });
    }

    // El precio de los niveles llega en velas de 5 minutos; en 0DTE eso ya es
    // viejo. Se saca el precio real de la misma cadena (paridad put-call).
    const precio = elegirSpot(chain.rows, levels.spot);

    const plan = buildCreditPlan(ticker, chain.rows, {
      spot: precio.spot,
      callWall: levels.callWall,
      putWall: levels.putWall,
      regimen: levels.regime,
      capital,
    });

    return Response.json({
      ...plan,
      aviso: [precio.aviso, plan.aviso].filter(Boolean).join(" ") || null,
      spotNiveles: levels.spot,
      spotFuente: precio.fuente,
      desfasePct: precio.desfasePct,
      expiration: chain.expiration,
      chainSource: chain.source,
      callWall: levels.callWall,
      putWall: levels.putWall,
      magnet: levels.magnet,
      asOf: levels.asOf,
    });
  } catch {
    return Response.json({ error: "No se pudo armar el plan de prima." }, { status: 502 });
  }
}
