// Cliente de Tastytrade — API OFICIAL. Scopes del grant: read + trade.
// OAuth2 con "grant personal": guardamos client_id + client_secret + refresh_token.
// Con el refresh_token se sacan access tokens de 15 min (se renuevan solos).
// Las órdenes SIEMPRE las dispara la usuaria desde la UI; nunca se envían solas.

import { promises as fs } from "fs";
import path from "path";
import { occSymbol, type Side } from "./orderBuilder";

const CREDS_FILE = path.join(process.cwd(), "data", "tastytrade_creds.json");
const TOKEN_FILE = path.join(process.cwd(), "data", "tastytrade_token.json");
const USER_AGENT = "nagimi-ai/1.0"; // Tastytrade exige User-Agent con formato producto/versión.

function apiBase(env: string): string {
  return env === "sandbox" ? "https://api.cert.tastyworks.com" : "https://api.tastyworks.com";
}

export class TastyError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TastyError";
    this.status = status;
  }
}

interface Creds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  env: "prod" | "sandbox";
}

interface Token {
  access_token: string;
  obtained_at: number;
}

export async function setCreds(c: Creds): Promise<void> {
  await fs.mkdir(path.dirname(CREDS_FILE), { recursive: true });
  await fs.writeFile(CREDS_FILE, JSON.stringify(c, null, 2), "utf8");
  // Invalida cualquier access token viejo al cambiar credenciales.
  try { await fs.unlink(TOKEN_FILE); } catch { /* no existía */ }
}

async function loadCreds(): Promise<Creds | null> {
  try {
    return JSON.parse(await fs.readFile(CREDS_FILE, "utf8")) as Creds;
  } catch {
    return null;
  }
}

export async function isConnected(): Promise<boolean> {
  const c = await loadCreds();
  return !!(c && c.refreshToken && c.clientId && c.clientSecret);
}

async function loadToken(): Promise<Token | null> {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, "utf8")) as Token;
  } catch {
    return null;
  }
}

/** Cambia el refresh_token por un access token de 15 min. */
async function refreshAccessToken(c: Creds): Promise<Token> {
  const res = await fetch(`${apiBase(c.env)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new TastyError(`No se pudo obtener el access token (${res.status}). Revisa las credenciales o vuelve a crear el grant.`, res.status);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new TastyError("Tastytrade no devolvió access_token.");
  const tok: Token = { access_token: j.access_token, obtained_at: Date.now() };
  await fs.writeFile(TOKEN_FILE, JSON.stringify(tok), "utf8");
  return tok;
}

async function accessToken(): Promise<{ at: string; base: string }> {
  const c = await loadCreds();
  if (!c) throw new TastyError("No conectado a Tastytrade. Pega tus credenciales primero.");
  let tok = await loadToken();
  // El access token dura 15 min; lo renovamos preventivamente a los 13.
  if (!tok || Date.now() - tok.obtained_at > 13 * 60 * 1000) tok = await refreshAccessToken(c);
  return { at: tok.access_token, base: apiBase(c.env) };
}

async function tastyGet(pathname: string): Promise<unknown> {
  const { at, base } = await accessToken();
  const res = await fetch(`${base}${pathname}`, {
    headers: { Authorization: `Bearer ${at}`, "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TastyError(`Error leyendo ${pathname} (${res.status}).`, res.status);
  }
  return res.json();
}

/** Valida las credenciales sacando un access token (no lee cuentas). */
export async function validate(): Promise<boolean> {
  const c = await loadCreds();
  if (!c) return false;
  await refreshAccessToken(c);
  return true;
}

interface TastyAccount {
  accountNumber: string;
  nickname: string;
  balance: unknown;
  positions: unknown;
}

/** SOLO LECTURA: lista de cuentas, cada una con su balance y posiciones. */
export async function getAccounts(): Promise<{ accounts: TastyAccount[] }> {
  const list = (await tastyGet("/customers/me/accounts")) as {
    data?: { items?: { account?: { "account-number"?: string; nickname?: string } }[] };
  };
  const items = list.data?.items ?? [];
  const accounts: TastyAccount[] = [];
  for (const it of items) {
    const num = it.account?.["account-number"];
    if (!num) continue;
    const [balance, positions] = await Promise.all([
      tastyGet(`/accounts/${num}/balances`).catch(() => null),
      tastyGet(`/accounts/${num}/positions`).catch(() => null),
    ]);
    accounts.push({ accountNumber: num, nickname: it.account?.nickname ?? num, balance, positions });
  }
  return { accounts };
}

async function tastyPost(pathname: string, body: unknown): Promise<unknown> {
  const { at, base } = await accessToken();
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${at}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { message?: string; errors?: { message?: string }[] } } | null)?.error;
    // Tastytrade anida el motivo real en error.errors[]; el message de arriba suele ser genérico.
    const nested = err?.errors?.map((e) => e.message).filter(Boolean).join(" · ");
    const detail = nested || err?.message;
    throw new TastyError(detail ?? `Tastytrade rechazó la orden (${res.status}).`, res.status);
  }
  return json;
}

export interface OrderLegInput {
  side: Side;
  optionType: "call" | "put";
  strike: number;
  quantity: number;
}

export interface SubmitOrderInput {
  accountNumber: string;
  underlying: string;
  expiration: string; // YYYY-MM-DD
  legs: OrderLegInput[];
  /** Precio neto de la estrategia, por contrato y en positivo. */
  price: number;
  /** "Debit" = pagas, "Credit" = recibes. */
  priceEffect: "Debit" | "Credit";
  timeInForce?: "Day" | "GTC";
}

export interface OrderOutcome {
  buyingPowerEffect: number | null;
  fees: number | null;
  warnings: string[];
  status: string | null;
  orderId: string | null;
  raw: unknown;
}

function buildOrderPayload(o: SubmitOrderInput) {
  return {
    "order-type": "Limit",
    "time-in-force": o.timeInForce ?? "Day",
    price: Math.abs(o.price),
    "price-effect": o.priceEffect,
    legs: o.legs.map((l) => ({
      "instrument-type": "Equity Option",
      symbol: occSymbol(o.underlying, o.expiration, l.optionType, l.strike),
      quantity: l.quantity,
      // Estrategias nuevas: todas las patas abren posición.
      action: l.side === "buy" ? "Buy to Open" : "Sell to Open",
    })),
  };
}

function readOutcome(json: unknown): OrderOutcome {
  const d = (json as { data?: Record<string, unknown> } | null)?.data ?? {};
  const order = (d.order ?? {}) as Record<string, unknown>;
  const bpe = d["buying-power-effect"] as { "change-in-buying-power"?: string } | undefined;
  const fees = d["fee-calculation"] as { "total-fees"?: string } | undefined;
  const warnings = (d.warnings ?? []) as { message?: string }[];
  return {
    buyingPowerEffect: bpe?.["change-in-buying-power"] != null ? Number(bpe["change-in-buying-power"]) : null,
    fees: fees?.["total-fees"] != null ? Number(fees["total-fees"]) : null,
    warnings: warnings.map((w) => w.message ?? "").filter(Boolean),
    status: (order.status as string) ?? null,
    orderId: order.id != null ? String(order.id) : null,
    raw: json,
  };
}

/** Valida la orden en Tastytrade SIN ejecutarla: devuelve poder de compra, comisiones y avisos. */
export async function dryRunOrder(o: SubmitOrderInput): Promise<OrderOutcome> {
  return readOutcome(await tastyPost(`/accounts/${o.accountNumber}/orders/dry-run`, buildOrderPayload(o)));
}

/** Envía la orden de verdad. Solo debe llamarse tras una confirmación explícita de la usuaria. */
export async function placeOrder(o: SubmitOrderInput): Promise<OrderOutcome> {
  return readOutcome(await tastyPost(`/accounts/${o.accountNumber}/orders`, buildOrderPayload(o)));
}
