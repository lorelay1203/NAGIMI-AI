// ============================================================================
// Lee lo que va acumulando `streamer/tastytrade-flow.mjs` y lo convierte en las
// señales que usa el filtro de la estrategia.
//
// Aporta DOS cosas que MarketSnack no da:
//   · Flujo con agresor sin depender de una cookie que caduca.
//   · La VELOCIDAD de la cinta — si el dinero corre o está tranquilo — que solo
//     se puede medir con una serie de tiempo, no con una foto.
//
// Si el streamer no está corriendo, todo devuelve "no disponible": el filtro
// trata lo que falta como "no filtra", nunca como "todo en orden".
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "ttflow");

/** Se considera fresco si se actualizó hace menos de esto. */
export const STALE_MS = 3 * 60 * 1000; // 3 min
/** Ventana reciente para medir la velocidad. */
const RECENT_MS = 2 * 60 * 1000;

export interface TtBucket {
  strike: number; type: "call" | "put";
  ask: number; bid: number; mid: number;      // contratos por lado del agresor
  trades: number; volume: number; oi: number;
  gamma: number | null; delta: number | null; iv: number | null;
  bidPrice: number | null; askPrice: number | null; ts: number;
}
export interface TtFile {
  ticker: string; date: string; source: string; updatedAt: string;
  spot: number | null; lastTradeAt: number | null;
  buckets: Record<string, TtBucket>;
  samples: { t: number; contracts: number }[];
}

export interface TtFlow {
  disponible: boolean;
  fresco: boolean;
  /** Motivo cuando no se puede usar (para mostrarlo, no para adivinar). */
  motivo: string | null;
  updatedAt: string | null;
  spot: number | null;
  /** Prima agresiva alcista: comprar calls + vender puts. */
  bull: number;
  /** Prima agresiva bajista: comprar puts + vender calls. */
  bear: number;
  /** Contratos comprados menos vendidos (CVD). */
  cvd: number;
  /** Velocidad de la cinta: 1 = ritmo normal del día, 2 = va al doble. */
  velocity: number | null;
  strikes: number;
}

const VACIO: TtFlow = {
  disponible: false, fresco: false, motivo: null, updatedAt: null, spot: null,
  bull: 0, bear: 0, cvd: 0, velocity: null, strikes: 0,
};

/** Fecha de hoy en horario del este, que es el día de mercado. */
export function etToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * Velocidad = ritmo de los últimos 2 minutos ÷ ritmo medio de la sesión.
 * Devuelve null si no hay muestras suficientes: sin serie de tiempo no se puede
 * medir, y es mejor decirlo que inventar un 1.
 */
export function velocityFrom(samples: { t: number; contracts: number }[], now = Date.now()): number | null {
  if (samples.length < 3) return null;
  const first = samples[0], last = samples[samples.length - 1];

  const totalSec = (last.t - first.t) / 1000;
  const totalContracts = last.contracts - first.contracts;
  if (totalSec <= 0 || totalContracts <= 0) return null;
  const baseline = totalContracts / totalSec;
  if (baseline <= 0) return null;

  // Primera muestra dentro de la ventana reciente.
  const cut = now - RECENT_MS;
  const recentStart = samples.find((s) => s.t >= cut) ?? first;
  const recSec = (last.t - recentStart.t) / 1000;
  if (recSec <= 0) return null;
  const recent = (last.contracts - recentStart.contracts) / recSec;

  return recent / baseline;
}

/** Prima en dólares de un lado del bucket, usando el precio medio del contrato. */
function premium(b: TtBucket, contracts: number): number {
  const mid = b.bidPrice != null && b.askPrice != null && b.askPrice > 0
    ? (b.bidPrice + b.askPrice) / 2
    : null;
  // Sin precio se cuenta el contrato como 1 unidad: mejor que descartarlo, y el
  // filtro solo mira proporciones.
  return mid != null && mid > 0 ? contracts * mid * 100 : contracts;
}

/** Convierte el fichero del streamer en señales. PURA: testeable sin disco. */
export function readTtFile(file: TtFile, now = Date.now()): TtFlow {
  const updatedMs = Date.parse(file.updatedAt);
  const fresco = Number.isFinite(updatedMs) && now - updatedMs < STALE_MS && file.date === etToday(new Date(now));

  let bull = 0, bear = 0, cvd = 0, strikes = 0;
  for (const b of Object.values(file.buckets ?? {})) {
    strikes++;
    cvd += b.ask - b.bid;
    // Comprar calls (al ask) o vender puts (al bid) empuja arriba; al revés, abajo.
    if (b.type === "call") { bull += premium(b, b.ask); bear += premium(b, b.bid); }
    else { bear += premium(b, b.ask); bull += premium(b, b.bid); }
  }

  return {
    disponible: true,
    fresco,
    motivo: fresco ? null : "Los datos del streamer están viejos (¿lo paraste, o está cerrado el mercado?).",
    updatedAt: file.updatedAt ?? null,
    spot: file.spot ?? null,
    bull, bear, cvd,
    velocity: velocityFrom(file.samples ?? [], now),
    strikes,
  };
}

/** Lee el fichero del día para un ticker. No lanza: si no hay, lo dice. */
export async function getTtFlow(ticker: string, now = Date.now()): Promise<TtFlow> {
  const clean = ticker.trim().toUpperCase();
  const file = path.join(DIR, `${clean}-${etToday(new Date(now))}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return readTtFile(JSON.parse(raw) as TtFile, now);
  } catch {
    return { ...VACIO, motivo: `El streamer de Tastytrade no está corriendo para ${clean}.` };
  }
}
