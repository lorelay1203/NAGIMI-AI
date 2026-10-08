// GET /api/ticket?ticker=SPY&capital=100[&source=marketsnack|schwab]
//
// Junta el motor 0DTE completo:
//   niveles de gamma del día → ¿hay setup de vuelta al imán? → ¿lo confirma el
//   flujo? → ¿qué CONTRATO concreto lo expresa, y cabe en la cuenta?

import { getDayGex } from "@/lib/dayGex";
import { nivelesConEspejo } from "@/lib/nivelesEspejoServidor";
import { getTicketChain, type TicketChainSource } from "@/lib/ticketChain";
import { pickTicket, ticketParamsFor } from "@/lib/contractTicket";
import { dynamicPinParams, evaluateEmpujon, evaluatePin, gatePin, noPinReason, riskReward, type FlowCtx, type PinSetup } from "@/lib/pinStrategy";
import { expectedMove } from "@/lib/expectedMove";
import { fetchFlow } from "@/lib/marketsnack";
import { classifyFlow } from "@/lib/flow";
import { analyzeMarketPressure } from "@/lib/marketPressure";
import { getTtFlow } from "@/lib/ttFlow";
import { contarBarridas, type FilaFlujo } from "@/lib/barridas";
import { revisarReglasOro } from "@/lib/reglasOro";

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
  /** Las operaciones del día (MarketSnack), para contar barridas sobre el contrato. */
  filas: FilaFlujo[];
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
          velocidad, filas: rows,
        };
      }
    }
  } catch { /* sin cookie: se intenta con Tastytrade */ }

  // Sin MarketSnack, el streamer sirve de respaldo para la dirección.
  if (tt?.fresco && tt.bull + tt.bear > 0) {
    return {
      ctx: { bull: tt.bull, bear: tt.bear, velocity: velocidad },
      disponible: true, premium: tt.bull + tt.bear, fuente: "tastytrade", velocidad, filas: [],
    };
  }

  return { ctx: {}, disponible: false, premium: 0, fuente: null, velocidad, filas: [] };
}

/** Días hasta el vencimiento contando desde HOY en Nueva York (0 = vence hoy). */
function diasParaVencer(expiration: string | null, ahora: Date): number {
  if (!expiration) return 0;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(ahora);
  const d = (Date.parse(`${expiration.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });

  const capital = Number(searchParams.get("capital") ?? 100) || 100;
  // ?muros=propios → usar los muros del propio ETF en vez de los del índice.
  const propios = searchParams.get("muros") === "propios";
  const rawSrc = searchParams.get("source");
  const only = (["marketsnack", "schwab"] as const).find((s) => s === rawSrc) as TicketChainSource | undefined;

  try {
    const { levels, avisoEspejo } = await nivelesConEspejo(ticker, propios);

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

    // Dos recetas según el tipo de día:
    //   · día de rango (gamma positiva) → volver al imán.
    //   · día de empujón (gamma negativa) → ir con el dinero hasta el próximo muro.
    let setup: PinSetup | null = evaluatePin(levels.spot, regime, magnet, levels.gammaFlip, params);
    let estrategia: "iman" | "empujon" = "iman";
    let noSetup: string | null = setup ? null : noPinReason(levels.spot, regime, magnet, params);

    // El flujo se lee una sola vez: en día de empujón pone la dirección y,
    // en los dos casos, sirve de filtro.
    let flow: Awaited<ReturnType<typeof flowContext>> | null = null;
    if (!setup && regime === "negative" && !simulated) {
      flow = await flowContext(ticker);
      const emp = evaluateEmpujon(levels.spot, regime, levels, flow.ctx, sigma, params);
      setup = emp.setup;
      estrategia = "empujon";
      noSetup = emp.setup ? null : emp.reason;
    }

    if (!setup) {
      return Response.json({
        ticker, levels, sigma, avisoEspejo, setup: null, verdict: null, ticket: null, estrategia,
        noSetup,
        expiration: chain?.expiration ?? null,
        chainSource: chain?.source ?? null,
        chainStats,
      simulated,
      });
    }

    // Flujo para el filtro: si el dinero corre en contra de la idea, esperar.
    if (!flow) flow = await flowContext(ticker);
    const verdict = gatePin(setup, flow.ctx, levels.gammaFlip, params);

    let ticket = null, ticketReason: string | null = null;
    let usedChain = chain;

    // Antes de las 9:30 AM (hora de Nueva York) las opciones no tienen precio
    // de compra y venta. Eso no es "poca gente": es que no ha abierto. Se dice así.
    const sinPrecios = chainStats != null && chainStats.conHorquilla === 0;

    if (chain && sinPrecios) {
      ticketReason = "Las opciones todavía no tienen precio de compra y venta (abren a las 9:30 AM hora de Nueva York). Vuelve a mirar cuando abra el mercado.";
    } else if (chain) {
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

    // ¿El dinero grande con prisa está comprando ESTE mismo contrato hoy?
    // null = no se pudo mirar (sin operaciones de MarketSnack), que no es lo
    // mismo que "cero barridas".
    const barridas = ticket && flow.filas.length > 0
      ? contarBarridas(flow.filas, { type: ticket.type, strike: ticket.strike, expiration: ticket.expiration }, new Date())
      : null;

    // Chequeo con las reglas de oro: ¿vale la pena tomar este contrato?
    const ahora = new Date();
    const reglasOro = revisarReglasOro({
      ticker, espejoDe: levels.espejo?.indice ?? null,
      spot: levels.spot, fuenteGex: levels.source, netGex: levels.netGex,
      gammaFlip: levels.gammaFlip, magnet, callWall: levels.callWall, putWall: levels.putWall,
      bars: levels.bars, direccion: setup.direction, meta: setup.target,
      contrato: ticket ? {
        strike: ticket.strike, type: ticket.type, mid: ticket.mid, delta: ticket.delta,
        theta: ticket.theta, iv: ticket.iv, dte: diasParaVencer(ticket.expiration, ahora),
      } : null,
      ahora,
    });

    return Response.json({
      ticker, levels, sigma, avisoEspejo,
      setup: { ...setup, rr: riskReward(setup) },
      reglasOro,
      barridas,
      estrategia,
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
