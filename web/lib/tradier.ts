// Cliente de Tradier — cadena de opciones con griegos reales e IV, vía API key estable.
// Respaldo del GEX cuando MarketSnack (cookie) no está disponible. Solo servidor.
// Endpoints:
//   /v1/markets/quotes?symbols=T                                  → precio
//   /v1/markets/options/expirations?symbol=T                      → vencimientos
//   /v1/markets/options/chains?symbol=T&expiration=D&greeks=true  → contratos + griegos
// Env: TRADIER_API_KEY  ·  TRADIER_SANDBOX=true (para datos diferidos gratis).

import type { GexHeatmap, HeatStrike } from "./gexHeatmap";

const NEAR_SPOT = 0.2;
const MAX_EXPIRATIONS = 8;

export class TradierError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TradierError";
    this.status = status;
  }
}

function cfg(): { token: string; base: string } {
  const token = process.env.TRADIER_API_KEY;
  if (!token || !token.trim()) throw new TradierError("Falta TRADIER_API_KEY en .env.local.");
  const base = process.env.TRADIER_SANDBOX === "true"
    ? "https://sandbox.tradier.com/v1"
    : "https://api.tradier.com/v1";
  return { token: token.trim(), base };
}

async function tGet(path: string): Promise<Response> {
  const { token, base } = cfg();
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) throw new TradierError("Token de Tradier inválido.", 401);
  return res;
}

async function spotOf(ticker: string): Promise<number> {
  const res = await tGet(`/markets/quotes?symbols=${encodeURIComponent(ticker)}`);
  if (!res.ok) return 0;
  const j = (await res.json()) as { quotes?: { quote?: { last?: number; close?: number } | { last?: number; close?: number }[] } };
  const q = j?.quotes?.quote;
  const quote = Array.isArray(q) ? q[0] : q;
  return quote?.last ?? quote?.close ?? 0;
}

interface TradierOption {
  strike?: number;
  option_type?: "call" | "put";
  open_interest?: number;
  greeks?: { gamma?: number; mid_iv?: number };
}
interface StrikeAgg { call: number; put: number; oi: number; ivSum: number; ivN: number }

/** GEX por strike con gamma REAL de Tradier. Compatible con GexHeatmapCard. */
export async function fetchTradierChainGex(ticker: string): Promise<GexHeatmap> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new TradierError("Ticker vacío.");

  const spot = await spotOf(clean);
  if (!(spot > 0)) throw new TradierError("Sin precio del subyacente en Tradier.");

  const expRes = await tGet(`/markets/options/expirations?symbol=${encodeURIComponent(clean)}`);
  if (!expRes.ok) throw new TradierError(`expirations respondió ${expRes.status}.`, expRes.status);
  const expJson = (await expRes.json()) as { expirations?: { date?: string | string[] } };
  let dates = expJson?.expirations?.date ?? [];
  if (!Array.isArray(dates)) dates = [dates];
  dates = dates.slice(0, MAX_EXPIRATIONS);

  const map = new Map<number, StrikeAgg>();
  for (const date of dates) {
    const res = await tGet(`/markets/options/chains?symbol=${encodeURIComponent(clean)}&expiration=${encodeURIComponent(date)}&greeks=true`);
    if (!res.ok) continue;
    const j = (await res.json()) as { options?: { option?: TradierOption | TradierOption[] } };
    let opts = j?.options?.option ?? [];
    if (!Array.isArray(opts)) opts = [opts];
    for (const c of opts) {
      const strike = c?.strike;
      const gamma = c?.greeks?.gamma;
      const oi = c?.open_interest ?? 0;
      if (typeof strike !== "number" || typeof gamma !== "number" || oi <= 0) continue;
      if (Math.abs(strike - spot) / spot > NEAR_SPOT) continue;
      const gex = gamma * oi * 100 * spot * spot * 0.01;
      const e = map.get(strike) ?? { call: 0, put: 0, oi: 0, ivSum: 0, ivN: 0 };
      if (c.option_type === "call") e.call += gex;
      else e.put += gex;
      e.oi += oi;
      const iv = c?.greeks?.mid_iv;
      if (typeof iv === "number" && iv > 0 && iv < 5) { e.ivSum += iv; e.ivN += 1; }
      map.set(strike, e);
    }
  }

  const strikes: HeatStrike[] = [...map.entries()]
    .map(([strike, e]) => ({
      strike,
      netGex: e.call - e.put,
      callGex: e.call,
      putGex: e.put,
      openInterest: e.oi,
      distancePct: ((strike - spot) / spot) * 100,
    }))
    .sort((a, b) => b.strike - a.strike);

  let totalNetGex = 0, ivSum = 0, ivN = 0;
  for (const [, e] of map) { ivSum += e.ivSum; ivN += e.ivN; }
  for (const s of strikes) totalNetGex += s.netGex;

  return {
    spot,
    iv: ivN > 0 ? ivSum / ivN : 0,
    strikes,
    expirations: [],
    cells: [],
    maxAbsCell: 0,
    hottestPositive: null,
    hottestNegative: null,
    totalNetGex,
  };
}
