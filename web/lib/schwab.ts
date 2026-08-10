// Cliente de Schwab (thinkorswim) — API OFICIAL. FASE 1: SOLO LECTURA.
// OAuth2: el usuario inicia sesión en Schwab; guardamos access/refresh token.
// Aquí NO se colocan órdenes (eso será una fase posterior, con confirmación manual).

import { promises as fs } from "fs";
import path from "path";

const AUTH_BASE = "https://api.schwabapi.com/v1/oauth";
const TRADER_BASE = "https://api.schwabapi.com/trader/v1";
const TOKENS_FILE = path.join(process.cwd(), "data", "schwab_tokens.json");

export class SchwabError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SchwabError";
    this.status = status;
  }
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  obtained_at?: number;
}

function cfg(): { clientId: string; secret: string; redirect: string } {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const secret = process.env.SCHWAB_CLIENT_SECRET;
  const redirect = process.env.SCHWAB_REDIRECT_URI || "https://127.0.0.1:8182";
  if (!clientId || !secret) {
    throw new SchwabError("Faltan SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET en .env.local.");
  }
  return { clientId: clientId.trim(), secret: secret.trim(), redirect: redirect.trim() };
}

function basicAuth(): string {
  const { clientId, secret } = cfg();
  return "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64");
}

/** URL a la que el usuario va para iniciar sesión y autorizar en Schwab. */
export function authUrl(): string {
  const { clientId, redirect } = cfg();
  return `${AUTH_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}`;
}

async function saveTokens(tok: Tokens): Promise<void> {
  tok.obtained_at = Date.now();
  await fs.mkdir(path.dirname(TOKENS_FILE), { recursive: true });
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tok, null, 2), "utf8");
}

async function loadTokens(): Promise<Tokens | null> {
  try {
    return JSON.parse(await fs.readFile(TOKENS_FILE, "utf8")) as Tokens;
  } catch {
    return null;
  }
}

/** Extrae el `code` de la URL de retorno que pega el usuario (o del código pelado). */
export function codeFromRedirect(input: string): string {
  const raw = input.trim();
  try {
    const u = new URL(raw);
    const c = u.searchParams.get("code");
    if (c) return c;
  } catch {
    /* no era URL completa */
  }
  return raw; // asumir que pegó el code directo
}

/** Intercambia el code por tokens (una vez, tras el login). */
export async function exchangeCode(code: string): Promise<void> {
  const { redirect } = cfg();
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect }),
  });
  if (!res.ok) {
    throw new SchwabError(`No se pudo obtener el token (${res.status}). ${(await res.text()).slice(0, 200)}`, res.status);
  }
  await saveTokens((await res.json()) as Tokens);
}

async function refresh(tok: Tokens): Promise<Tokens> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token }),
  });
  if (!res.ok) {
    throw new SchwabError(`No se pudo refrescar el token (${res.status}). Vuelve a conectar con Schwab.`, res.status);
  }
  const nt = (await res.json()) as Tokens;
  nt.refresh_token = nt.refresh_token ?? tok.refresh_token; // por si no lo reenvía
  await saveTokens(nt);
  return nt;
}

async function accessToken(): Promise<string> {
  let tok = await loadTokens();
  if (!tok) throw new SchwabError("No conectado a Schwab. Inicia sesión primero.");
  // El access token dura ~30 min; refrescamos preventivamente a los 27.
  if (Date.now() - (tok.obtained_at ?? 0) > 27 * 60 * 1000) tok = await refresh(tok);
  return tok.access_token;
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) != null;
}

/** SOLO LECTURA: cuentas + posiciones. */
export async function getAccounts(): Promise<unknown> {
  const at = await accessToken();
  const res = await fetch(`${TRADER_BASE}/accounts?fields=positions`, {
    headers: { Authorization: `Bearer ${at}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SchwabError(`No se pudieron leer las cuentas (${res.status}).`, res.status);
  }
  return res.json();
}
