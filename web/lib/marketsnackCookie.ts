// Fuente de la cookie de MarketSnack en RUNTIME (no requiere reiniciar).
// Prioridad: archivo web/data/marketsnack_cookie.txt → si no, process.env.MARKETSNACK_COOKIE.
// El botón "Renovar cookie" escribe ese archivo, así la app la toma al instante.

import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "marketsnack_cookie.txt");

/** Lectura síncrona para los clientes de MarketSnack (se llama por request). */
export function getMarketsnackCookie(): string {
  try {
    const c = fs.readFileSync(FILE, "utf8").trim();
    if (c) return c;
  } catch { /* sin archivo → usa env */ }
  return (process.env.MARKETSNACK_COOKIE ?? "").trim();
}

/** Normaliza lo que pegue la usuaria: header completo, "Cookie: ...", o solo la sesión. */
export function normalizeCookie(raw: string, current: string): string {
  let input = raw.trim().replace(/^cookie:\s*/i, "").replace(/\s*\r?\n\s*/g, " ");
  // Quita atributos que a veces vienen pegados (del Set-Cookie o de la vista Application).
  input = input
    .replace(/;\s*(path|domain|expires|max-age|samesite)=[^;]*/gi, "")
    .replace(/;\s*(secure|httponly)\b/gi, "")
    .trim()
    .replace(/;\s*$/, "");
  const sess = input.match(/_market_snack_session=[^;\s]*/);
  const pairs = input.split(/;\s*/).filter((p) => p.includes("="));
  const hasOthers = pairs.some((p) => !p.startsWith("_market_snack_session="));
  if (hasOthers) return input; // pegó el header completo (con _ga, etc.)
  if (sess) {
    // Pegó solo la sesión → la fusiona con la cookie actual (conserva las analíticas).
    if (current.includes("_market_snack_session=")) return current.replace(/_market_snack_session=[^;\s]*/, sess[0]);
    return current ? `${current}; ${sess[0]}` : sess[0];
  }
  return input;
}

export async function setMarketsnackCookie(raw: string): Promise<string> {
  const full = normalizeCookie(raw, getMarketsnackCookie());
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE, full, "utf8");
  return full;
}

/** Prueba la cookie contra MarketSnack (200 = válida). */
export async function validateMarketsnackCookie(cookie: string): Promise<boolean> {
  try {
    const r = await fetch("https://app.marketsnack.com/api/assets/SPY/expirations", {
      headers: { cookie, "user-agent": "Mozilla/5.0", accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
    });
    return r.status === 200;
  } catch {
    return false;
  }
}
