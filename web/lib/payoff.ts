// Payoff y probabilidad de una estrategia de opciones — puro, para el cliente.
// P/L al vencimiento por precio del subyacente + probabilidad de ganancia (POP)
// integrando una distribución lognormal (spot, IV, tiempo).

import type { Strategy } from "./orderBuilder";

export interface PayoffLeg {
  side: "buy" | "sell";
  optionType: "call" | "put";
  strike: number;
  quantity: number;
  limitPrice: number;
}

/** Ganancia/pérdida de la posición si el subyacente termina en S. */
export function plAtExpiry(legs: PayoffLeg[], S: number): number {
  return legs.reduce((sum, l) => {
    const intr = l.optionType === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    const sign = l.side === "buy" ? 1 : -1;
    return sum + sign * (intr - l.limitPrice) * 100 * l.quantity;
  }, 0);
}

export interface PayoffResult {
  maxGain: number;
  maxLoss: number;
  pop: number; // probabilidad de ganancia (0-1), por IV
  breakevens: number[];
  unbounded: boolean;
}

export function analyzeStrategy(legs: PayoffLeg[], spot: number, iv: number, days: number): PayoffResult {
  const T = Math.max(days, 1) / 365;
  const sigma = iv > 0 && iv < 5 ? iv : 0.5;
  const sqrtT = Math.sqrt(T);
  const lo = Math.max(0.01, spot * Math.exp(-4 * sigma * sqrtT));
  const hi = spot * Math.exp(4 * sigma * sqrtT);
  const N = 500;
  const stepS = (hi - lo) / N;
  const mu = Math.log(spot) - 0.5 * sigma * sigma * T;
  const denom = sigma * sqrtT;

  let maxGain = -Infinity, maxLoss = Infinity, profitW = 0, totalW = 0;
  const breakevens: number[] = [];
  let prevPL: number | null = null;

  for (let i = 0; i <= N; i++) {
    const S = lo + i * stepS;
    const pl = plAtExpiry(legs, S);
    if (pl > maxGain) maxGain = pl;
    if (pl < maxLoss) maxLoss = pl;
    const z = (Math.log(S) - mu) / denom;
    const w = Math.exp(-0.5 * z * z) / S; // ∝ densidad lognormal
    totalW += w;
    if (pl > 0) profitW += w;
    if (prevPL != null && ((prevPL < 0 && pl >= 0) || (prevPL >= 0 && pl < 0))) {
      breakevens.push(Math.round(S * 100) / 100);
    }
    prevPL = pl;
  }

  const pop = totalW > 0 ? profitW / totalW : 0;
  const unbounded = plAtExpiry(legs, hi) > plAtExpiry(legs, hi - stepS) + 1;
  return { maxGain, maxLoss, pop, breakevens, unbounded };
}

/** Sesgo direccional de la estrategia (para comparar con los agentes). */
export function strategyBias(strategy: Strategy, baseType: "call" | "put"): "up" | "down" | "flat" {
  if (strategy === "iron_condor" || strategy === "butterfly" || strategy === "condor") return "flat";
  if (strategy === "credit") return baseType === "put" ? "up" : "down"; // put credit = alcista
  return baseType === "call" ? "up" : "down";
}

/** Ajusta la probabilidad estadística con la lectura de los agentes (dirección + confianza). */
export function adjustPop(pop: number, bias: "up" | "down" | "flat", agentDir: "up" | "down" | "flat" | null, confidence: number | null): number {
  if (!agentDir || confidence == null) return pop;
  const aligned = bias === agentDir || (bias === "flat" && agentDir === "flat");
  const nudge = (aligned ? 1 : -1) * (confidence / 100) * 0.15; // ±15% máx
  return Math.min(0.98, Math.max(0.02, pop + nudge));
}
