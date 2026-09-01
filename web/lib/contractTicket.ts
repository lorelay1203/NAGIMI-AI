// ============================================================================
// Ticket de contrato — portado del Agente 0DTE y ADAPTADO a cuenta chica.
//
// Traduce la TESIS (dirección + objetivo + stop en el PRECIO DE LA ACCIÓN) a un
// CONTRATO concreto que comprar, con su stop y objetivo en DÓLARES DE LA OPCIÓN.
// Sin esto, "SPY va al imán 763" no dice qué comprar ni cuándo salir.
//
// Cómo se proyecta el precio de la opción cuando la acción se mueve ΔS:
//     precio(ΔS) ≈ mid + delta·ΔS + ½·gamma·ΔS²
// (delta con signo: call +, put −). Es una aproximación local, buena dentro de
// ~1-1,5σ. La gamma engorda la ganancia al objetivo Y amortigua la pérdida al
// stop, así que el riesgo/beneficio de la OPCIÓN suele salir mejor que el lineal
// de la acción.
//
// ⚠️ Diferencia con el original: allí el riesgo máximo por defecto era $600 y el
// volumen mínimo 2000 (calibrado para SPX). Con una cuenta de ~$100 eso no sirve,
// así que aquí los topes salen del CAPITAL de la usuaria y se avisa claramente
// cuando el contrato no le cabe.
// ============================================================================

import type { PinSetup } from "./pinStrategy";

/** Lo mínimo que hace falta saber de cada strike de la cadena. */
export interface TicketChainRow {
  strike: number;
  type: "call" | "put";
  bid: number | null;
  ask: number | null;
  delta: number | null; // firmado por la fuente (put negativo)
  gamma: number | null;
  iv: number | null;
  volume: number;
  oi: number;
  expiration?: string;
  symbol?: string | null;
}

export interface TicketParams {
  /** Banda de |delta| aceptable. */
  deltaMin: number;
  deltaMax: number;
  /** |delta| ideal (centro de la banda) para elegir. */
  deltaTarget: number;
  minVol: number;
  minOi: number;
  /** (ask−bid)/mid máximo: el mejor filtro de liquidez real. */
  maxSpreadPct: number;
  /** Pérdida máxima al stop, en $ por contrato. */
  maxRisk: number;
  /** Lo máximo que se puede pagar por el contrato, en $. */
  maxCost: number;
}

/**
 * Topes a partir del capital. Con cuenta chica lo que manda es lo que CABE:
 * un contrato de SPY 0DTE al dinero cuesta $100-300, así que con $100 hay que
 * mirar deltas más bajas (contratos más baratos, más lejos del dinero).
 */
export function ticketParamsFor(capital: number): TicketParams {
  const cap = capital > 0 ? capital : 100;
  const small = cap < 500;
  return {
    // Con poco capital se amplía la banda hacia abajo: la delta 0.40-0.60 casi
    // siempre queda fuera de presupuesto.
    deltaMin: small ? 0.18 : 0.40,
    deltaMax: 0.60,
    deltaTarget: small ? 0.32 : 0.50,
    // Pisos bajos a propósito: el spread es mejor filtro de liquidez, y en 0DTE
    // el OI es de AYER (las posiciones de hoy todavía no cuentan).
    minVol: 50,
    minOi: 50,
    maxSpreadPct: 0.08,
    // No arriesgar más del 35% de la cuenta en un solo contrato barato, con techo.
    maxRisk: Math.min(cap * 0.35, 300),
    // Y no pagar más del 40% de la cuenta por una sola posición.
    maxCost: Math.min(cap * 0.40, 1500),
  };
}

export interface Ticket {
  strike: number;
  type: "call" | "put";
  expiration: string | null;
  symbol: string | null;
  bid: number;
  ask: number;
  mid: number;
  delta: number;      // |delta|
  gamma: number;
  iv: number | null;
  volume: number;
  oi: number;
  spreadPct: number;
  /** Precio de la opción si la acción llega al objetivo. */
  targetPx: number;
  /** Precio de la opción si la acción llega al stop. */
  stopPx: number;
  /** Riesgo/beneficio sobre la OPCIÓN (incluye el efecto de la gamma). */
  rbOption: number;
  cost: number;       // mid × 100 — lo que pagas por 1 contrato
  risk: number;       // (mid − stopPx) × 100 — lo que pierdes si toca el stop
  gain: number;       // (targetPx − mid) × 100 — lo que ganas si llega al objetivo
  gainPct: number;
  lossPct: number;
  /** % de la cuenta que se arriesga con 1 contrato. */
  riskPctOfCapital: number | null;
  /** % de la cuenta que cuesta comprarlo. */
  costPctOfCapital: number | null;
  /**
   * Probabilidad aproximada de acabar dentro del dinero, en %. La delta sirve
   * de estimación estándar. IMPORTA: un contrato barato y lejano puede lucir un
   * riesgo/beneficio enorme justamente porque es poco probable — sin este dato
   * el R:B engaña.
   */
  approxPop: number;
  /** Aviso cuando la relación premio/riesgo se apoya en una probabilidad baja. */
  warning: string | null;
}

export interface TicketResult {
  ticket: Ticket | null;
  /** Por qué no hay contrato, cuando `ticket` es null. */
  reason: string | null;
  /** Cuántos strikes de la cadena se miraron y por qué se descartaron. */
  rejected: { total: number; byDelta: number; byLiquidity: number; bySpread: number; byCost: number; byRisk: number };
}

/** Proyecta el precio de la opción a un nivel de la acción. Piso $0.05. */
export function projectPx(mid: number, deltaSigned: number, gamma: number, dS: number): number {
  return Math.max(0.05, mid + deltaSigned * dS + 0.5 * gamma * dS * dS);
}

/**
 * Elige el mejor contrato para expresar el setup. Devuelve también POR QUÉ se
 * descartó todo cuando no hay ninguno: con cuenta chica lo normal es que el
 * motivo sea el precio, y saberlo vale más que un "sin contrato" a secas.
 */
export function pickTicket(
  setup: PinSetup,
  spot: number,
  chain: TicketChainRow[],
  params: TicketParams,
  capital?: number,
): TicketResult {
  const rejected = { total: 0, byDelta: 0, byLiquidity: 0, bySpread: 0, byCost: 0, byRisk: 0 };
  if (!(spot > 0) || !(setup.target > 0) || !(setup.stop > 0)) {
    return { ticket: null, reason: "Faltan precios del setup.", rejected };
  }

  const wantType: "call" | "put" = setup.direction === "long" ? "call" : "put";
  const dST = setup.target - spot; // cuánto se mueve la acción hasta el objetivo
  const dSS = setup.stop - spot;   // y hasta el stop

  let best: Ticket | null = null;
  let bestScore = Infinity;

  for (const r of chain) {
    if (r.type !== wantType) continue;
    rejected.total++;
    if (r.bid == null || r.ask == null || !(r.ask > 0) || !(r.bid >= 0)) { rejected.byLiquidity++; continue; }
    if (r.delta == null || r.gamma == null || !(r.gamma >= 0)) { rejected.byLiquidity++; continue; }

    const ad = Math.abs(r.delta);
    if (ad < params.deltaMin || ad > params.deltaMax) { rejected.byDelta++; continue; }
    if (r.volume < params.minVol || r.oi < params.minOi) { rejected.byLiquidity++; continue; }

    const mid = (r.bid + r.ask) / 2;
    if (!(mid > 0)) { rejected.byLiquidity++; continue; }
    const spreadPct = (r.ask - r.bid) / mid;
    if (spreadPct > params.maxSpreadPct) { rejected.bySpread++; continue; }

    const cost = mid * 100;
    if (cost > params.maxCost) { rejected.byCost++; continue; }

    const deltaSigned = r.type === "call" ? ad : -ad;
    const targetPx = projectPx(mid, deltaSigned, r.gamma, dST);
    const stopPx = projectPx(mid, deltaSigned, r.gamma, dSS);
    const gain = targetPx - mid, loss = mid - stopPx;
    if (!(gain > 0) || !(loss > 0)) { rejected.byRisk++; continue; } // proyección incoherente
    const risk = loss * 100;
    if (risk > params.maxRisk) { rejected.byRisk++; continue; }

    // Se elige la delta más cercana a la ideal; desempata el spread más apretado.
    const score = Math.abs(ad - params.deltaTarget) + spreadPct * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = {
        strike: r.strike, type: r.type, expiration: r.expiration ?? null, symbol: r.symbol ?? null,
        bid: r.bid, ask: r.ask, mid, delta: ad, gamma: r.gamma, iv: r.iv,
        volume: r.volume, oi: r.oi, spreadPct,
        targetPx, stopPx, rbOption: gain / loss,
        cost, risk, gain: gain * 100,
        gainPct: gain / mid, lossPct: loss / mid,
        riskPctOfCapital: capital && capital > 0 ? (risk / capital) * 100 : null,
        costPctOfCapital: capital && capital > 0 ? (cost / capital) * 100 : null,
        approxPop: ad * 100,
        warning: popWarning(ad, gain / loss),
      };
    }
  }

  if (best) return { ticket: best, reason: null, rejected };
  return { ticket: null, reason: explainRejection(rejected, wantType), rejected };
}

/**
 * Un R:B enorme casi siempre viene de una probabilidad baja: el contrato es
 * barato porque es poco probable que llegue. Decirlo evita leer "37:1" como si
 * fuera dinero fácil.
 */
function popWarning(absDelta: number, rb: number): string | null {
  const pop = Math.round(absDelta * 100);
  if (absDelta < 0.25 && rb > 5) {
    return `Ojo: se ve un premio grande porque es POCO probable (~${pop}% de acabar dentro del dinero). `
      + `Lo más habitual es que este contrato expire sin valor. Arriesga solo lo que puedas perder entero.`;
  }
  if (absDelta < 0.35) {
    return `Probabilidad baja (~${pop}%): es una apuesta barata, cuenta con perderla completa a menudo.`;
  }
  return null;
}

/** Traduce el conteo de descartes a una frase útil. */
function explainRejection(r: TicketResult["rejected"], type: "call" | "put"): string {
  const kind = type === "call" ? "calls" : "puts";
  if (r.total === 0) return `La cadena no trae ${kind} para este vencimiento.`;
  const worst = Math.max(r.byCost, r.byDelta, r.byLiquidity, r.bySpread, r.byRisk);
  if (worst === r.byCost) return `Hay ${kind} que encajan con la idea, pero todas cuestan más de lo que permite tu cuenta.`;
  if (worst === r.byRisk) return `Los contratos que caben arriesgan más de la cuenta si toca el stop.`;
  if (worst === r.byDelta) return `Ningún ${type === "call" ? "call" : "put"} cae en la banda de delta buscada.`;
  if (worst === r.bySpread) return `Los contratos tienen la horquilla muy abierta (poca liquidez): entrar y salir saldría caro.`;
  return `No hay ${kind} con liquidez suficiente (volumen/interés abierto) en este vencimiento.`;
}
