// Cache en disco de barras diarias, por día de mercado.
//
// Las barras diarias solo cambian una vez al día, pero el escaneo de Wheel
// las pide para 40 tickers en cada pasada. Sin cache serían 40 llamadas
// repetidas por escaneo. Solo servidor.
//
// `fetchDailyBars` sigue sin cache para el resto de rutas: este store es
// nuevo y en v1 solo lo usa Wheel.

import { promises as fs } from "fs";
import path from "path";
import { marketDateStr } from "./occ";
import { fetchDailyBars } from "./massive";
import type { DailyBar } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "bars");

export interface BarsFile {
  ticker: string;
  /** Día de mercado (ET) en que se guardó. */
  date: string;
  bars: DailyBar[];
}

function fileFor(ticker: string): string {
  const safe = ticker.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
  return path.join(DATA_DIR, `${safe}.json`);
}

export async function loadBars(ticker: string): Promise<BarsFile | null> {
  try {
    const raw = await fs.readFile(fileFor(ticker), "utf8");
    return JSON.parse(raw) as BarsFile;
  } catch {
    return null;
  }
}

export async function saveBars(ticker: string, bars: DailyBar[], now = new Date()): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload: BarsFile = { ticker: ticker.toUpperCase(), date: marketDateStr(now), bars };
  await fs.writeFile(fileFor(ticker), JSON.stringify(payload), "utf8");
}

export interface BarsOpts {
  /** Cuántas veces pedirle a Massive antes de rendirse. */
  intentos?: number;
  /** Pausa base entre intentos, en ms (crece con cada intento). */
  pausaMs?: number;
  /** Inyectables para las pruebas. */
  fetch?: (ticker: string, days: number) => Promise<DailyBar[]>;
  load?: (ticker: string) => Promise<BarsFile | null>;
  save?: (ticker: string, bars: DailyBar[], now: Date) => Promise<void>;
}

const dormir = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Barras diarias con cache de un día de mercado.
 *
 * Massive a veces devuelve vacío cuando le llegan varios pedidos a la vez (y
 * `fetchDailyBars` no avisa: devuelve []). Por eso se reintenta, y si aun así no
 * responde se devuelven las barras guardadas del día anterior: para el GEX y los
 * niveles, las velas de ayer sirven; una lista vacía deja el panel pegado en
 * "Armando la lectura…" (pasó toda la sesión del 14-sep).
 *
 * Devuelve [] solo si nunca hubo barras de ese ticker.
 */
export async function cachedDailyBars(
  ticker: string,
  days = 365,
  now = new Date(),
  opts: BarsOpts = {},
): Promise<DailyBar[]> {
  const load = opts.load ?? loadBars;
  const save = opts.save ?? saveBars;
  const pedir = opts.fetch ?? fetchDailyBars;
  const intentos = Math.max(1, opts.intentos ?? 3);
  const pausaMs = opts.pausaMs ?? 600;

  const today = marketDateStr(now);
  const cached = await load(ticker);
  if (cached && cached.date === today && cached.bars.length > 0) return cached.bars;

  for (let i = 0; i < intentos; i++) {
    if (i > 0) await dormir(pausaMs * i);
    const bars = await pedir(ticker, days).catch(() => [] as DailyBar[]);
    if (bars.length > 0) {
      await save(ticker, bars, now).catch(() => {});
      return bars;
    }
  }

  // Massive no respondió: mejor las velas de ayer que nada.
  return cached?.bars ?? [];
}
