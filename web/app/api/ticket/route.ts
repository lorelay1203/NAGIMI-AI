// GET /api/ticket?ticker=SPY&capital=100[&source=marketsnack|schwab]
//
// Junta el motor 0DTE completo:
//   niveles de gamma del día → ¿hay setup de vuelta al imán? → ¿lo confirma el
//   flujo? → ¿qué CONTRATO concreto lo expresa, y cabe en la cuenta?

import { getDayGex } from "@/lib/dayGex";
import { getTicketChain, type TicketChainSource } from "@/lib/ticketChain";
import { pickTicket, ticketParamsFor } from "@/lib/contractTicket";
import { dynamicPinParams, evaluatePin, gatePin, noPinReason, riskReward, type FlowCtx } from "@/lib/pinStrategy";
import { expectedMove } from "@/lib/expectedMove";
import { fetchFlow } from "@/lib/marketsnack";
import { classifyFlow } from "@/lib/flow";
import { analyzeMarketPressure } from "@/lib/marketPressure";
import { getTtFlow } from "@/lib/ttFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Señales de flujo para el filtro de la estrategia.
 *
 * La DIRECCIÓN (cuánto dinero empuja arriba vs abajo) sale de MarketSnack, que
 * sigue siendo la fuente principal; si no hay cookie, del streamer de Tastytrade.
 * La VELOCIDAD solo la puede dar el streamer, porque hace falta una serie de
 * tiempo y MarketSnack entrega una foto.
 *
 * Lo que no se pueda medir se devuelve vacío: el filtro trata lo que falta como
 * "no filtra", nunca como "todo en orden".
 */
async function flowContext(ticker: string): Promise<{
  ctx: FlowCtx; disponible: boolean; premium: number; fuente: string | null; velocidad: number | null;
}> {
  // Tastytrade en vivo (si el streamer está corriendo). Es lo ÚNICO que puede
  // medir la velocidad de la cinta, porque guarda una serie de tiempo.
  const tt = await getTtFlow(ticker).catch(() => null);
  const velocidad = tt?.fresco ? tt.velocity : null;

  // Dirección: MarketSnack manda (es la fuente principal).
  try {
    const { trades } = await fetchFlow(ticker, { period: "1d", minPremium: 25_000, maxPages: 6 });
    const { rows } = classifyFlow(trades, new Date());
    if (rows.length > 0) {
      const p = analyzeMarketPressure(rows);
      const bull = p.cross.callsBought + p.cross.putsSold;
      const bear = p.cross.callsSold + p.cross.putsBought;
      if (bull + bear > 0) {
        return {
          ctx: { bull, bear, velocity: velocidad },
          disponible: true, premium: p.side.total,
          fuente: velocidad != null ? "marketsnack+tastytrade" : "marketsnack",
          velocidad,
        };
      }
    }
  } catch { /* sin cookie: se intenta con Tastytrade */ }

  // Sin MarketSnack, el streamer sirve de respaldo para la dirección.
  if (tt?.fresco && tt.bull + tt.bear > 0) {
    return {
      ctx: { bull: tt.bull, bear: tt.bear, velocity: velocidad },
      disponible: true, premium: tt.bull + tt.bear, fuente: "tastytrade", velocidad,
    };
  }

  return { ctx: {}, disponible: false, premium: 0, fuente: null, velocidad };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });

  const capital = Number(searchParams.get("capital") ?? 100) || 100;
  const rawSrc = searchParams.get("source");
  const only = (["marketsnack", "schwab"] as const).find((s) => s === rawSrc) as TicketChainSource | undefined;

  try {
    const levels = await getDayGex(ticker);

    const chain = await getTicketChain(ticker, only).catch(() => null);

    // σ del día (cuánto se espera que se mueva) para calibrar las distancias del
    // setup. Se toma la IV del contrato más cercano al dinero: es la que mejor
    // describe la sesión de hoy.
    let sigma: number | null = null;
    if (chain) {
      const atm = chain.rows
        .filter((r) => r.iv != null && r.iv > 0)
        .sort((a, b) => Math.abs(a.strike - levels.spot) - Math.abs(b.strike - levels.spot))[0];
      if (atm?.iv) sigma = expectedMove(levels.spot, atm.iv, 1).sigma;
    }

    // Diagnóstico de la cadena: si faltan griegas o horquilla, el ticket no se
    // puede armar, y conviene ver el porqué en vez de un "sin contrato" a secas.
    const chainStats = chain ? {
      strikes: chain.rows.length,
      conGriegas: chain.rows.filter((r) => r.delta != null && r.gamma != null).length,
      conHorquilla: chain.rows.filter((r) => r.bid != null && r.ask != null && r.ask > 0).length,
    } : null;

    const params = dynamicPinParams(levels.spot, sigma, ticker);

    // ?magnet=X&regime=positive simulan un escenario para ver QUÉ contrato se
    // elegiría si el imán estuviera ahí. No cambia los datos reales: la respuesta
    // viene marcada como simulada para que la pantalla lo deje claro.
    const magnetSim = Number(searchParams.get("magnet"));
    const simulated = Number.isFinite(magnetSim) && magnetSim > 0;
    const magnet = simulated ? magnetSim : levels.magnet;
    const regime = simulated ? "positive" : levels.regime;

    const setup = evaluatePin(levels.spot, regime, magnet, levels.gammaFlip, params);

    if (!setup) {
      return Response.json({
        ticker, levels, sigma, setup: null, verdict: null, ticket: null,
        noSetup: noPinReason(levels.spot, regime, magnet, params),
        expiration: chain?.expiration ?? null,
        chainSource: chain?.source ?? null,
        chainStats,
      simulated,
      });
    }

    // Flujo para el filtro: si el dinero corre en contra de la idea, esperar.
    const flow = await flowContext(ticker);
    const verdict = gatePin(setup, flow.ctx, levels.gammaFlip, params);

    let ticket = null, ticketReason: string | null = null;
    let usedChain = chain;

    if (chain) {
      const tp = ticketParamsFor(capital);
      const picked = pickTicket(setup, levels.spot, chain.rows, tp, capital);
      ticket = picked.ticket;
      ticketReason = picked.reason;

      // La cobertura de griegas de MarketSnack fluctúa (a veces faltan justo en
      // los strikes útiles). Si no salió contrato y la fuente era MarketSnack,
      // se reintenta con Schwab, que las trae completas. MarketSnack sigue
      // siendo la primera opción: esto solo entra cuando no dio resultado.
      if (!ticket && chain.source === "marketsnack" && !only) {
        const alt = await getTicketChain(ticker, "schwab").catch(() => null);
        if (alt) {
          const retry = pickTicket(setup, levels.spot, alt.rows, tp, capital);
          if (retry.ticket) {
            ticket = retry.ticket;
            ticketReason = null;
            usedChain = alt;
          }
        }
      }
    } else {
      ticketReason = "No se pudo leer la cadena de opciones para elegir el contrato.";
    }

    return Response.json({
      ticker, levels, sigma,
      setup: { ...setup, rr: riskReward(setup) },
      verdict, ticket, ticketReason,
      // Si el flujo no se pudo mirar, el "listo" vale menos: solo pasó el filtro
      // de riesgo/beneficio. La pantalla lo advierte.
      flujoRevisado: flow.disponible,
      flujoPremium: flow.premium,
      flujoFuente: flow.fuente,
      flujoVelocidad: flow.velocidad,
      expiration: usedChain?.expiration ?? null,
      chainSource: usedChain?.source ?? null,
      chainStats,
      simulated,
      capital,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo armar el ticket." },
      { status: 502 },
    );
  }
}
