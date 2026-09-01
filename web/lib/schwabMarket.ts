// ============================================================================
// Charles Schwab — DATOS DE MERCADO (cadena de opciones y precio). Solo servidor.
//
// Es una fuente de RESPALDO que complementa a MarketSnack (que sigue siendo la
// principal) y a Massive. Aporta tres cosas que las otras no dan siempre:
//   · No necesita cookie ni que la usuaria inicie sesión: usa OAuth2
//     `client_credentials` (máquina a máquina) con las claves que ya están en
//     .env.local. El token dura 1 h y se renueva solo.
//   · Trae ÍNDICES ($SPX, $NDX, $VIX, $RUT) que Massive no tiene.
//   · Trae el precio del subyacente, bid/ask reales, OI, volumen, IV y las
//     griegas de verdad por contrato.
//
// OJO: NO sustituye al fichero `schwab.ts` (ese es la conexión de CUENTAS de la
// usuaria, con su propio OAuth de usuario). Son dos cosas distintas y separadas.
//
// Salvedad: los datos pueden venir con retraso (la respuesta trae `isDelayed`).
// ============================================================================

import type { RawContract } from "./types";

const TOKEN_URL = process.env.SCHWAB_TOKEN_URL ?? "https://api.schwabapi.com/v1/oauth/token";
const API_BASE = process.env.SCHWAB_API_BASE ?? "https://api.schwabapi.com/marketdata/v1";

/** Schwab manda estos centinelas en vez de null cuando un dato no está. */
const SENTINELS = new Set([-999, -1, 999]);

/** Índices: Schwab los pide con "$" delante. */
const INDEX_SYMBOLS: Record<string, string> = {
  SPX: "$SPX", SPXW: "$SPX", NDX: "$NDX", VIX: "$VIX", RUT: "$RUT", DJX: "$DJI",
};

export class SchwabMarketError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SchwabMarketError";
    this.status = status;
  }
}

/** Convierte el ticker de Nagimi al símbolo que espera Schwab. */
export function schwabSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase().replace(/^\$/, "");
  return INDEX_SYMBOLS[clean] ?? clean;
}

// ----------------------------------------------------------------- token

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Borra el token en caché (tests, o tras un 401). */
export function resetSchwabMarketToken(): void {
  cachedToken = null;
}

/** ¿Están puestas las claves? Sirve para decidir si merece la pena intentarlo. */
export function hasSchwabMarketKeys(): boolean {
  return Boolean(process.env.SCHWAB_CLIENT_ID && process.env.SCHWAB_CLIENT_SECRET);
}

/** Token de acceso cacheado; se renueva 60 s antes de vencer. */
export async function getMarketToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const id = process.env.SCHWAB_CLIENT_ID;
  const secret = process.env.SCHWAB_CLIENT_SECRET;
  if (!id || !secret) throw new SchwabMarketError("Faltan SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET en .env.local.");

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SchwabMarketError(`Schwab no dio token (HTTP ${res.status}).`, res.status);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new SchwabMarketError("Schwab devolvió un token vacío.");
  const ttl = (j.expires_in ?? 3600) - 60; // margen de 60 s
  cachedToken = { value: j.access_token, expiresAt: Date.now() + ttl * 1000 };
  return cachedToken.value;
}

// ------------------------------------------------------------- parseo puro

export interface SchwabOption {
  putCall?: string; symbol?: string; bid?: number; ask?: number; last?: number;
  mark?: number; closePrice?: number; totalVolume?: number; openInterest?: number;
  volatility?: number; // en PORCENTAJE (39.74)
  delta?: number; gamma?: number; theta?: number; vega?: number; rho?: number;
  strikePrice?: number; daysToExpiration?: number; multiplier?: number;
}

export interface SchwabChainResponse {
  symbol?: string; status?: string; isDelayed?: boolean; underlyingPrice?: number;
  callExpDateMap?: Record<string, Record<string, SchwabOption[]>>;
  putExpDateMap?: Record<string, Record<string, SchwabOption[]>>;
}

export interface SchwabChainResult {
  contracts: RawContract[];
  underlyingPrice: number | null;
  delayed: boolean;
  expirationCount: number;
}

function num(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return SENTINELS.has(v) ? null : v;
}
/** Positivo estricto: Schwab manda 0.0 cuando no hay cotización. */
function pos(v: unknown): number | undefined {
  const n = num(v);
  return n !== null && n > 0 ? n : undefined;
}

/** Clave de vencimiento de Schwab: "2026-09-18:0" → "2026-09-18". */
export function parseExpirationKey(key: string): string {
  return key.split(":")[0] ?? "";
}

/** Símbolo de Schwab ("SPY   260901C00748000") → estilo OCC del proyecto. */
export function toOccTicker(symbol: string | undefined): string {
  if (!symbol) return "";
  const compact = symbol.replace(/\s+/g, "");
  return compact ? `O:${compact}` : "";
}

/** Un contrato de Schwab → el RawContract que ya consume `toRow` de Nagimi. */
export function toRawContract(
  o: SchwabOption, expiration: string, underlying: string, underlyingPrice: number | null,
): RawContract {
  const ivPct = num(o.volatility);
  return {
    details: {
      contract_type: o.putCall?.toLowerCase() === "put" ? "put" : "call",
      expiration_date: expiration,
      strike_price: num(o.strikePrice) ?? 0,
      shares_per_contract: num(o.multiplier) ?? 100,
      ticker: toOccTicker(o.symbol),
    },
    day: { volume: num(o.totalVolume) ?? 0, close: pos(o.closePrice) },
    last_trade: { price: pos(o.last) ?? pos(o.mark) },
    open_interest: num(o.openInterest) ?? 0,
    underlying_asset: { price: underlyingPrice ?? undefined, ticker: underlying },
    // Extras de Schwab que Massive no da (opcionales: `toRow` los ignora, pero
    // así no se tiran y quedan disponibles para el resto de la app).
    quote: { bid: pos(o.bid), ask: pos(o.ask) },
    greeks: {
      delta: num(o.delta), gamma: num(o.gamma), theta: num(o.theta),
      vega: num(o.vega), rho: num(o.rho),
      iv: ivPct !== null ? ivPct / 100 : null, // Schwab da % ; el proyecto usa decimal
    },
  };
}

/** Aplana la respuesta de Schwab a una lista de contratos. PURA: testeable sin red. */
export function parseSchwabChain(json: SchwabChainResponse, ticker: string): SchwabChainResult {
  const underlyingPrice = num(json.underlyingPrice);
  const contracts: RawContract[] = [];
  const expirations = new Set<string>();

  for (const map of [json.callExpDateMap, json.putExpDateMap]) {
    if (!map) continue;
    for (const [expKey, strikes] of Object.entries(map)) {
      const expiration = parseExpirationKey(expKey);
      if (expiration) expirations.add(expiration);
      for (const list of Object.values(strikes)) {
        for (const o of list) contracts.push(toRawContract(o, expiration, ticker, underlyingPrice));
      }
    }
  }

  // SPX el día de vencimiento mensual trae DOS series que vencen hoy: la semanal
  // PM (SPXW, la que se opera) y la mensual AM (SPX, que dejó de cotizar ayer).
  // Sin filtrar, el GEX suma el OI de ambas por strike y los muros salen mal.
  let out = contracts;
  if (schwabSymbol(ticker) === "$SPX") {
    const spxw = contracts.filter((c) => c.details?.ticker?.startsWith("O:SPXW"));
    if (spxw.length > 0) out = spxw;
  }

  return { contracts: out, underlyingPrice, delayed: Boolean(json.isDelayed), expirationCount: expirations.size };
}

// --------------------------------------------------------------- peticiones

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cuántas veces se parte en dos un tramo que desborda antes de rendirse. */
const MAX_SPLIT_DEPTH = 4;

/** Pide UN tramo de fechas. Devuelve null si el tramo desborda (502) y hay que partirlo. */
async function fetchWindow(symbol: string, from: Date, to: Date): Promise<SchwabChainResponse | null> {
  const token = await getMarketToken();
  const url = `${API_BASE}/chains?symbol=${encodeURIComponent(symbol)}`
    + `&contractType=ALL&includeUnderlyingQuote=true`
    + `&fromDate=${isoDate(from)}&toDate=${isoDate(to)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) {
    resetSchwabMarketToken(); // token caducado antes de tiempo: el próximo intento lo renueva
    throw new SchwabMarketError("Schwab rechazó el token (401).", 401);
  }
  // 502 = "Body buffer overflow": el tramo trae demasiados contratos. Se parte.
  if (res.status === 502) return null;
  if (!res.ok) throw new SchwabMarketError(`Schwab ${res.status} al pedir la cadena de ${symbol}.`, res.status);
  return (await res.json()) as SchwabChainResponse;
}

/** Baja un tramo partiéndolo por la mitad mientras desborde. */
async function fetchWindowDeep(
  symbol: string, ticker: string, from: Date, to: Date, depth = 0,
): Promise<SchwabChainResult[]> {
  const json = await fetchWindow(symbol, from, to);
  if (json) {
    if (json.status?.toUpperCase() === "FAILED") return [];
    return [parseSchwabChain(json, ticker)];
  }
  // Desbordó. Si ya no se puede partir más, se abandona ESTE tramo (no todo).
  const span = to.getTime() - from.getTime();
  if (depth >= MAX_SPLIT_DEPTH || span <= DAY_MS) return [];
  const mid = new Date(from.getTime() + Math.floor(span / 2));
  const [a, b] = await Promise.all([
    fetchWindowDeep(symbol, ticker, from, mid, depth + 1),
    fetchWindowDeep(symbol, ticker, new Date(mid.getTime() + DAY_MS), to, depth + 1),
  ]);
  return [...a, ...b];
}

/**
 * Cadena de opciones desde Schwab, acotada por días al vencimiento.
 *
 * ⚠️ El gateway de Schwab corta la respuesta sobre los ~10 MB y devuelve
 * `502 Body buffer overflow`. Los subyacentes con vencimientos DIARIOS (SPX,
 * SPY, QQQ) desbordan fácil, así que la cadena se pide en TRAMOS —más finos
 * cerca de hoy, que es donde se apilan los vencimientos— y cada tramo que aún
 * desborde se parte en dos automáticamente.
 */
export async function fetchSchwabChain(ticker: string, maxDte = 60): Promise<SchwabChainResult> {
  const symbol = schwabSymbol(ticker);
  const today = new Date();

  // Tramos crecientes: los primeros días son los más cargados.
  const edges = [0, 3, 7, 14, 30, maxDte].filter((d, i, a) => d <= maxDte && a.indexOf(d) === i);
  const windows: Array<[Date, Date]> = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = new Date(today.getTime() + edges[i] * DAY_MS);
    const to = new Date(today.getTime() + edges[i + 1] * DAY_MS);
    windows.push([from, to]);
  }

  const parts = (await Promise.all(
    windows.map(([f, t]) => fetchWindowDeep(symbol, ticker, f, t).catch(() => [])),
  )).flat();

  // Fusiona los tramos, sin repetir contratos (los bordes pueden solaparse).
  const seen = new Set<string>();
  const contracts: RawContract[] = [];
  const expirations = new Set<string>();
  let underlyingPrice: number | null = null;
  let delayed = false;

  for (const p of parts) {
    if (underlyingPrice === null && p.underlyingPrice !== null) underlyingPrice = p.underlyingPrice;
    delayed = delayed || p.delayed;
    for (const c of p.contracts) {
      const key = c.details?.ticker || `${c.details?.contract_type}${c.details?.expiration_date}${c.details?.strike_price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contracts.push(c);
      if (c.details?.expiration_date) expirations.add(c.details.expiration_date);
    }
  }

  if (contracts.length === 0) throw new SchwabMarketError(`Schwab no devolvió contratos para ${symbol}.`);
  return { contracts, underlyingPrice, delayed, expirationCount: expirations.size };
}

/**
 * Cierres diarios. Importa para los ÍNDICES: Massive no tiene SPX, así que sin
 * esto el motor de GEX se queda sin histórico, no puede estimar la volatilidad
 * y los muros acaban cayendo en los strikes de más interés abierto (redondos y
 * lejanos) en vez de donde de verdad está la gamma.
 */
export async function fetchSchwabDailyCloses(ticker: string, days = 60): Promise<number[]> {
  const token = await getMarketToken();
  const symbol = schwabSymbol(ticker);
  const url = `${API_BASE}/pricehistory?symbol=${encodeURIComponent(symbol)}`
    + `&periodType=month&period=3&frequencyType=daily&frequency=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json()) as { candles?: Array<{ close?: number }> };
  return (j.candles ?? [])
    .map((c) => num(c.close) ?? 0)
    .filter((c) => c > 0)
    .slice(-days); // viejo → nuevo, que es lo que espera estimateIV
}

/** Precio del subyacente (sirve también para índices, que Massive no cubre). */
export async function fetchSchwabQuote(ticker: string): Promise<number | null> {
  const token = await getMarketToken();
  const symbol = schwabSymbol(ticker);
  const res = await fetch(`${API_BASE}/quotes?symbols=${encodeURIComponent(symbol)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, { quote?: { lastPrice?: number; mark?: number; closePrice?: number } }>;
  const q = Object.values(j)[0]?.quote;
  return pos(q?.lastPrice) ?? pos(q?.mark) ?? pos(q?.closePrice) ?? null;
}
