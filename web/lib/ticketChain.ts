// ============================================================================
// Cadena del vencimiento MÁS CERCANO con griegas y horquilla, para el ticket.
//
// Prueba las fuentes en el mismo orden que el resto de la app:
//   1) MarketSnack (la principal) — /option_chain_extended trae griegas reales.
//   2) Schwab (respaldo) — no necesita cookie y cubre índices como SPX.
//
// Devuelve solo el vencimiento más próximo: el ticket es para operar HOY, y
// mezclar vencimientos daría contratos con delta parecida pero riesgo distinto.
// ============================================================================

import { getMarketsnackCookie } from "./marketsnackCookie";
import { msFetch as msFetchAuto } from "./marketsnackFetch";
import { fetchSchwabChain } from "./schwabMarket";
import type { TicketChainRow } from "./contractTicket";

const MS_BASE = "https://app.marketsnack.com";

export type TicketChainSource = "marketsnack" | "schwab";

export interface TicketChain {
  source: TicketChainSource;
  expiration: string;
  rows: TicketChainRow[];
}

interface MsContract {
  symbol?: string;
  strike?: number;
  type?: "call" | "put";
  open_interest?: number;
  volume?: number;
  implied_volatility?: number | null;
  greeks?: { gamma?: number; delta?: number };
  last_quote?: { bid?: number; ask?: number };
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Cadena del vencimiento más cercano, probando MarketSnack y luego Schwab. */
export async function getTicketChain(ticker: string, only?: TicketChainSource): Promise<TicketChain> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new Error("Ticker vacío.");
  const errors: string[] = [];
  const want = (s: TicketChainSource) => !only || only === s;

  if (want("marketsnack") && getMarketsnackCookie()) {
    try {
      return await msTicketChain(clean);
    } catch (e) {
      errors.push(`MarketSnack: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (want("schwab")) {
    try {
      return await schwabTicketChain(clean);
    } catch (e) {
      errors.push(`Schwab: ${e instanceof Error ? e.message : e}`);
    }
  }

  throw new Error(`No se pudo obtener la cadena de ${clean}. ${errors.join(" · ")}`);
}

async function msTicketChain(ticker: string): Promise<TicketChain> {
  const expRes = await msFetchAuto(`${MS_BASE}/api/assets/${encodeURIComponent(ticker)}/expirations`);
  if (!expRes.ok) throw new Error(`expirations respondió ${expRes.status}.`);
  const exps = (await expRes.json()) as { date?: string }[];
  const expiration = (exps ?? []).map((e) => e.date).filter((d): d is string => !!d)[0];
  if (!expiration) throw new Error("sin vencimientos.");

  const res = await msFetchAuto(
    `${MS_BASE}/api/assets/${encodeURIComponent(ticker)}/option_chain_extended?expiration_date=${encodeURIComponent(expiration)}`,
  );
  if (!res.ok) throw new Error(`option_chain_extended respondió ${res.status}.`);
  const contracts = (await res.json()) as MsContract[];

  const rows: TicketChainRow[] = [];
  for (const c of contracts ?? []) {
    const strike = n(c.strike);
    if (strike === null || (c.type !== "call" && c.type !== "put")) continue;
    rows.push({
      strike,
      type: c.type,
      bid: n(c.last_quote?.bid),
      ask: n(c.last_quote?.ask),
      delta: n(c.greeks?.delta),
      gamma: n(c.greeks?.gamma),
      iv: n(c.implied_volatility),
      volume: n(c.volume) ?? 0,
      oi: n(c.open_interest) ?? 0,
      expiration,
      symbol: c.symbol ?? null,
    });
  }
  if (rows.length === 0) throw new Error("cadena vacía.");
  return { source: "marketsnack", expiration, rows };
}

async function schwabTicketChain(ticker: string): Promise<TicketChain> {
  // 7 días basta: solo interesa el vencimiento más cercano.
  const chain = await fetchSchwabChain(ticker, 7);

  // El vencimiento más próximo de los que llegaron.
  const dates = [...new Set(chain.contracts.map((c) => c.details?.expiration_date).filter((d): d is string => !!d))].sort();
  const expiration = dates[0];
  if (!expiration) throw new Error("sin vencimientos.");

  const rows: TicketChainRow[] = [];
  for (const c of chain.contracts) {
    if (c.details?.expiration_date !== expiration) continue;
    const strike = n(c.details?.strike_price);
    const type = c.details?.contract_type;
    if (strike === null || (type !== "call" && type !== "put")) continue;
    rows.push({
      strike,
      type,
      bid: c.quote?.bid ?? null,
      ask: c.quote?.ask ?? null,
      delta: c.greeks?.delta ?? null,
      gamma: c.greeks?.gamma ?? null,
      iv: c.greeks?.iv ?? null,
      volume: c.day?.volume ?? 0,
      oi: c.open_interest ?? 0,
      expiration,
      symbol: c.details?.ticker ?? null,
    });
  }
  if (rows.length === 0) throw new Error("cadena vacía.");
  return { source: "schwab", expiration, rows };
}
