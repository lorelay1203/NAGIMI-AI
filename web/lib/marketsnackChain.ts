// Cadena de opciones de MarketSnack CON GRIEGOS REALES (gamma, delta) e IV.
// Endpoints:
//   /api/assets/{T}/expirations                              → [{date, symbols}]
//   /api/assets/{T}/option_chain_extended?expiration_date=D  → [contratos con greeks]
// Con eso se calcula el GEX por strike usando gamma REAL (no Black-Scholes).
// Solo servidor. Devuelve una estructura compatible con GexHeatmapCard.

import type { GexHeatmap, HeatStrike } from "./gexHeatmap";
import { fetchMsGex } from "./marketsnackGex";
import { generateLegs, type Strategy } from "./orderBuilder";
import { getMarketsnackCookie } from "./marketsnackCookie";
import { msFetch as msFetchAuto } from "./marketsnackFetch";

const BASE_URL = "https://app.marketsnack.com";
const NEAR_SPOT = 0.2;     // ±20% del spot
const MAX_EXPIRATIONS = 8; // vencimientos más cercanos (para no hacer demasiadas llamadas)

export class MsChainError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MsChainError";
    this.status = status;
  }
}

function cookie(): string {
  const c = getMarketsnackCookie();
  if (!c) throw new MsChainError("Falta la cookie de MarketSnack. Renuévala en /cookie.");
  return c;
}

async function msFetch(path: string): Promise<Response> {
  cookie(); // valida presencia; msFetchAuto la lee fresca y re-loguea si caducó
  const res = await msFetchAuto(`${BASE_URL}${path}`);
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new MsChainError("Sesión de MarketSnack inválida o expirada.", res.status);
  }
  return res;
}

interface RawContract {
  symbol?: string;
  strike?: number;
  type?: "call" | "put";
  open_interest?: number;
  volume?: number;
  price?: number;
  price_change?: { percentage?: number; absolute?: number };
  premium_traded?: number;
  implied_volatility?: number | null;
  greeks?: { gamma?: number; delta?: number; theta?: number; vega?: number };
  last_quote?: { bid?: number; ask?: number; mid?: number };
}

/** Detalle completo de un contrato para corroborar el trade (griegos + vol + OI). */
export interface ContractDetail {
  symbol: string | null;
  type: "call" | "put";
  strike: number;
  expiration: string;
  price: number | null;
  priceChangePct: number | null;
  bid: number; ask: number; mid: number;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  volume: number | null;
  openInterest: number | null;
  premiumTraded: number | null;
}

interface StrikeAgg { call: number; put: number; oi: number; ivSum: number; ivN: number }

/**
 * GEX por strike con gamma REAL de MarketSnack. Compatible con GexHeatmapCard.
 */
export async function fetchMsChainGex(ticker: string, spotHint?: number): Promise<GexHeatmap> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new MsChainError("Ticker vacío.");

  // 1) Spot: del stats de GEX (o el hint que venga).
  let spot = spotHint && spotHint > 0 ? spotHint : 0;
  if (!spot) {
    const g = await fetchMsGex(clean).catch(() => null);
    spot = g?.latest?.assetPrice ?? 0;
  }
  if (!(spot > 0)) throw new MsChainError("Sin precio del subyacente.");

  // 2) Vencimientos (los más cercanos).
  const expRes = await msFetch(`/api/assets/${encodeURIComponent(clean)}/expirations`);
  if (!expRes.ok) throw new MsChainError(`expirations respondió ${expRes.status}.`, expRes.status);
  const expJson = (await expRes.json()) as { date?: string }[];
  const dates = (expJson ?? []).map((e) => e.date).filter((d): d is string => !!d).slice(0, MAX_EXPIRATIONS);

  // 3) Cadena por vencimiento → agregar GEX por strike con gamma real.
  const map = new Map<number, StrikeAgg>();
  for (const date of dates) {
    const res = await msFetch(
      `/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(date)}`,
    );
    if (!res.ok) continue;
    const contracts = (await res.json()) as RawContract[];
    for (const c of contracts) {
      const strike = c.strike;
      const gamma = c.greeks?.gamma;
      const oi = c.open_interest ?? 0;
      if (typeof strike !== "number" || typeof gamma !== "number" || oi <= 0) continue;
      // Solo strikes cerca del spot (los LEAP lejanos no pintan).
      if (Math.abs(strike - spot) / spot > NEAR_SPOT) continue;
      const gex = gamma * oi * 100 * spot * spot * 0.01;
      const e = map.get(strike) ?? { call: 0, put: 0, oi: 0, ivSum: 0, ivN: 0 };
      if (c.type === "call") e.call += gex;
      else e.put += gex;
      e.oi += oi;
      if (typeof c.implied_volatility === "number" && c.implied_volatility > 0 && c.implied_volatility < 5) {
        e.ivSum += c.implied_volatility; e.ivN += 1;
      }
      map.set(strike, e);
    }
  }

  // 4) Construir strikes (de mayor a menor precio).
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

  let totalNetGex = 0;
  let ivSum = 0, ivN = 0;
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

export interface ContractSuggestion {
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  mid: number;
  iv: number | null;
  cost: number; // mid × 100
  spot: number;
}

/**
 * Sugiere el contrato (strike + vencimiento) más cercano al precio (ATM) que
 * QUEPA en el presupuesto (budget = tamaño de cuenta). Devuelve su bid/ask/mid
 * para proponer el precio límite. budget<=0 = sin límite (solo el más ATM).
 */
export async function suggestContract(
  ticker: string,
  type: "call" | "put",
  budget: number,
): Promise<ContractSuggestion | null> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new MsChainError("Ticker vacío.");

  const g = await fetchMsGex(clean).catch(() => null);
  const spot = g?.latest?.assetPrice ?? 0;
  if (!(spot > 0)) throw new MsChainError("Sin precio del subyacente.");

  const expRes = await msFetch(`/api/assets/${encodeURIComponent(clean)}/expirations`);
  if (!expRes.ok) throw new MsChainError(`expirations respondió ${expRes.status}.`, expRes.status);
  const expJson = (await expRes.json()) as { date?: string }[];
  const dates = (expJson ?? []).map((e) => e.date).filter((d): d is string => !!d).slice(0, 6);

  let best: ContractSuggestion | null = null;
  let bestScore = Infinity;
  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const res = await msFetch(`/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(date)}`);
    if (!res.ok) continue;
    const contracts = (await res.json()) as RawContract[];
    for (const c of contracts) {
      if (c.type !== type || typeof c.strike !== "number") continue;
      const bid = c.last_quote?.bid ?? 0;
      const ask = c.last_quote?.ask ?? 0;
      const mid = c.last_quote?.mid ?? (bid + ask) / 2;
      if (!(mid > 0)) continue;
      const cost = mid * 100;
      if (budget > 0 && cost > budget) continue; // no alcanza
      const dist = Math.abs(c.strike - spot) / spot; // cercanía a ATM
      const score = dist + di * 0.02; // ligera preferencia por vencimiento cercano
      if (score < bestScore) {
        bestScore = score;
        best = { strike: c.strike, expiration: date, bid, ask, mid, iv: c.implied_volatility ?? null, cost, spot };
      }
    }
  }
  return best;
}

export interface Quote { bid: number; ask: number; mid: number; iv: number | null }

/** Precio (bid/ask/mid) de un contrato exacto. Para llenar el límite de cada pata. */
export async function quoteContract(
  ticker: string,
  type: "call" | "put",
  strike: number,
  expiration: string,
): Promise<Quote | null> {
  const clean = ticker.trim().toUpperCase();
  if (!clean || !expiration) return null;
  const res = await msFetch(`/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(expiration)}`);
  if (!res.ok) return null;
  const contracts = (await res.json()) as RawContract[];
  const c = contracts.find((x) => x.type === type && x.strike === strike);
  if (!c) return null;
  const bid = c.last_quote?.bid ?? 0;
  const ask = c.last_quote?.ask ?? 0;
  const mid = c.last_quote?.mid ?? (bid + ask) / 2;
  return { bid, ask, mid, iv: c.implied_volatility ?? null };
}

/** Detalle COMPLETO de un contrato (griegos reales, precio, volumen, OI) para corroborar. */
export async function contractDetail(
  ticker: string,
  type: "call" | "put",
  strike: number,
  expiration: string,
): Promise<ContractDetail | null> {
  const clean = ticker.trim().toUpperCase();
  if (!clean || !expiration) return null;
  const res = await msFetch(`/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(expiration)}`);
  if (!res.ok) return null;
  const contracts = (await res.json()) as RawContract[];
  const c = contracts.find((x) => x.type === type && x.strike === strike);
  if (!c) return null;
  const bid = c.last_quote?.bid ?? 0;
  const ask = c.last_quote?.ask ?? 0;
  const g = c.greeks ?? {};
  return {
    symbol: c.symbol ?? null,
    type,
    strike,
    expiration,
    price: c.price ?? null,
    priceChangePct: c.price_change?.percentage ?? null,
    bid, ask,
    mid: c.last_quote?.mid ?? (bid + ask) / 2,
    iv: c.implied_volatility ?? null,
    delta: g.delta ?? null,
    gamma: g.gamma ?? null,
    theta: g.theta ?? null,
    vega: g.vega ?? null,
    volume: c.volume ?? null,
    openInterest: c.open_interest ?? null,
    premiumTraded: c.premium_traded ?? null,
  };
}

export interface StrategySuggestion { center: number; width: number; expiration: string }

/**
 * Sugiere strike central + ancho para que la estrategia QUEPA en el presupuesto.
 * Centro = strike más cercano al precio (ATM). Prueba anchos crecientes (múltiplos
 * del paso de strikes) y elige el mayor cuyo riesgo ≤ presupuesto, con precios reales.
 */
export async function suggestStrategy(
  ticker: string,
  strategy: Strategy,
  type: "call" | "put",
  budget: number,
): Promise<StrategySuggestion | null> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new MsChainError("Ticker vacío.");
  const g = await fetchMsGex(clean).catch(() => null);
  const spot = g?.latest?.assetPrice ?? 0;
  if (!(spot > 0)) throw new MsChainError("Sin precio del subyacente.");

  const expRes = await msFetch(`/api/assets/${encodeURIComponent(clean)}/expirations`);
  if (!expRes.ok) throw new MsChainError(`expirations respondió ${expRes.status}.`, expRes.status);
  const expJson = (await expRes.json()) as { date?: string }[];
  const dates = (expJson ?? []).map((e) => e.date).filter((d): d is string => !!d).slice(0, 4);

  for (const date of dates) {
    const res = await msFetch(`/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(date)}`);
    if (!res.ok) continue;
    const contracts = (await res.json()) as RawContract[];
    const callMid = new Map<number, number>();
    const putMid = new Map<number, number>();
    const strikeSet = new Set<number>();
    for (const c of contracts) {
      if (typeof c.strike !== "number") continue;
      const bid = c.last_quote?.bid ?? 0, ask = c.last_quote?.ask ?? 0;
      const mid = c.last_quote?.mid ?? (bid + ask) / 2;
      if (!(mid > 0)) continue;
      strikeSet.add(c.strike);
      if (c.type === "call") callMid.set(c.strike, mid);
      else if (c.type === "put") putMid.set(c.strike, mid);
    }
    const strikes = [...strikeSet].sort((a, b) => a - b);
    if (strikes.length < 2) continue;
    const center = strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best), strikes[0]);
    const idx = strikes.indexOf(center);
    const step = idx + 1 < strikes.length ? strikes[idx + 1] - strikes[idx] : (idx > 0 ? strikes[idx] - strikes[idx - 1] : 5);
    const midOf = (t: "call" | "put", k: number) => (t === "call" ? callMid : putMid).get(k);

    let chosenWidth = 0;
    for (const w of [step, 2 * step, 3 * step, 4 * step]) {
      const legs = generateLegs(strategy, type, center, w);
      let net = 0, ok = true;
      for (const lg of legs) {
        const m = midOf(lg.optionType, lg.strike);
        if (m == null) { ok = false; break; }
        net += (lg.side === "buy" ? 1 : -1) * m * 100 * lg.quantity;
      }
      if (!ok) continue;
      const risk = net >= 0 ? net : Math.max(0, w * 100 - Math.abs(net));
      if (budget <= 0 || risk <= budget) chosenWidth = w; // el mayor que quepa
      if (strategy === "single") break; // el ancho no aplica
    }
    if (chosenWidth > 0) return { center, width: chosenWidth, expiration: date };
    if (strategy === "single") {
      const m = midOf(type, center);
      if (m != null && (budget <= 0 || m * 100 <= budget)) return { center, width: step, expiration: date };
    }
  }
  return null;
}
