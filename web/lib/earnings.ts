// Próximo reporte de resultados para el Wheel — con FECHA REAL cuando se puede.
//
// Orden de fuentes:
//   1. Finnhub (/calendar/earnings) — la fecha real y si es antes de abrir o
//      después del cierre. Es la misma que usa el agente de Catalizadores.
//   2. Respaldo: estimado por la cadencia de filing_date de Massive (~91 días
//      entre reportes). El plan de Massive NO trae calendario (verificado:
//      /benzinga/v1/earnings da 403, /v1/reference/earnings da 404).
//
// La UI dice cuál de las dos se usó: con fecha real el castigo es completo;
// con estimado se castiga menos y se pide verificar.
//
// La parte pura (estimateNextEarnings, resolverEarnings) no toca red.

import type { EarningsInfo } from "./wheel";
import { fetchNextEarnings } from "./finnhub";

const QUARTER_DAYS = 91;
const DAY = 24 * 60 * 60 * 1000;

function toDay(d: string | number): string {
  return new Date(typeof d === "number" ? d : `${d}T00:00:00Z`).toISOString().slice(0, 10);
}

/**
 * Estima la fecha del próximo reporte a partir de los filing_date pasados.
 * Toma el más reciente y avanza en saltos de ~91 días hasta pasar HOY.
 */
export function estimateNextEarnings(filingDates: string[], now: Date): string | null {
  const times = filingDates
    .map((d) => new Date(`${d}T00:00:00Z`).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length === 0) return null;

  let next = times[times.length - 1];
  const nowT = now.getTime();
  while (next <= nowT) next += QUARTER_DAYS * DAY;
  return toDay(next);
}

/** Lo que se sabe del próximo reporte de un ticker, antes de mirar vencimientos. */
export interface DatosEarnings {
  /** Fecha real de Finnhub, con la hora del reporte ("bmo" | "amc" | "dmh"). */
  real: { date: string; hour: string | null } | null;
  /** Estimado por cadencia. Solo se busca si no hubo fecha real. */
  estimada: string | null;
}

/**
 * ¿El reporte le cae encima a ESTE vencimiento? Se decide por vencimiento, no
 * por ticker: un put de 7 días puede quedar antes del reporte y uno de 45 no.
 *
 * Detalle que importa: si reporta el MISMO día que vence pero después del
 * cierre ("amc"), la opción ya venció a las 4 PM — el brinco no le toca.
 */
export function resolverEarnings(datos: DatosEarnings, expiration: string): EarningsInfo {
  const { real, estimada } = datos;

  if (real?.date) {
    const despues = real.date > expiration || (real.date === expiration && real.hour === "amc");
    return { flag: despues ? "fuera" : "dentro_confirmado", fecha: real.date, fuente: "real" };
  }

  if (estimada) {
    return { flag: estimada > expiration ? "fuera" : "dentro", fecha: estimada, fuente: "estimada" };
  }

  return { flag: "no_aplica", fecha: null, fuente: null };
}

// ── Fetch (I/O — no se testea) ─────────────────────────────────────────

interface FinancialsResult {
  results?: { filing_date?: string }[];
}

/** Fechas de reporte pasadas de un ticker. Devuelve [] si el ticker no reporta (ETF). */
export async function fetchFilingDates(ticker: string): Promise<string[]> {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) return [];
  const clean = ticker.trim().toUpperCase();
  const url =
    `https://api.massive.com/vX/reference/financials?ticker=${encodeURIComponent(clean)}` +
    `&timeframe=quarterly&limit=6&order=desc&sort=filing_date`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" })
    .catch(() => null);
  if (!res || !res.ok) return [];
  const json = (await res.json().catch(() => null)) as FinancialsResult | null;
  return (json?.results ?? [])
    .map((r) => r.filing_date)
    .filter((d): d is string => Boolean(d));
}

// Finnhub gratis permite 60 llamadas por minuto y un escaneo del Wheel mira ~40
// tickers. Una fecha de reporte no cambia en el día, así que se guarda: la fecha
// encontrada vale 12 horas; "no encontré nada" solo 1 hora, por si fue un fallo.
const HORAS = 60 * 60 * 1000;
const cacheReal = new Map<string, { hasta: number; valor: DatosEarnings["real"] }>();

async function fechaReal(ticker: string, now: Date): Promise<DatosEarnings["real"]> {
  const clave = ticker.trim().toUpperCase();
  const guardado = cacheReal.get(clave);
  if (guardado && guardado.hasta > now.getTime()) return guardado.valor;

  const r = await fetchNextEarnings(clave, now).catch(() => null);
  const valor = r ? { date: r.date, hour: r.hour } : null;
  cacheReal.set(clave, { hasta: now.getTime() + (valor ? 12 : 1) * HORAS, valor });
  return valor;
}

/** Busca el próximo reporte: fecha real primero, estimado solo si no la hay. */
export async function datosEarnings(ticker: string, now: Date): Promise<DatosEarnings> {
  const real = await fechaReal(ticker, now);
  if (real) return { real, estimada: null };
  const filings = await fetchFilingDates(ticker);
  return { real: null, estimada: estimateNextEarnings(filings, now) };
}
