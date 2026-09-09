// ============================================================================
// Bitácora de reportes — todas las predicciones que Nagimi ha guardado, de
// todos los tickers, ya contrastadas con lo que el precio hizo después.
//
// FinAnalista lista los reportes; esta lista además dice si ACERTÓ. Los datos
// ya estaban en data/predictions/: lo único que faltaba era juntarlos y
// puntuarlos. Si a un ticker no se le pueden bajar las barras, sale en la
// lista con sus números pero sin veredicto — nunca se inventa un acierto.
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PredictionJournal, PredictionReview, EvalBar } from "./predictionStore";
import { reviewPredictions } from "./predictionStore";

const DATA_DIR = path.join(process.cwd(), "data", "predictions");

/** Una fila de la bitácora: un ticker con su última foto y su historial. */
export interface ReportRow {
  ticker: string;
  /** Fecha de la foto más reciente (YYYY-MM-DD). */
  ultimaFecha: string;
  /** Cuántas fotos hay guardadas de ese ticker. */
  total: number;
  /** Cuántas ya vencieron y por tanto se pueden puntuar. */
  vencidas: number;
  /** La foto más reciente, para mostrar bear/base/bull. */
  spot: number;
  bear: number;
  base: number;
  bull: number;
  direction: string;
  confidence: number;
  /** % de veces que acertó la dirección. null si aún no venció ninguna. */
  aciertoDireccion: number | null;
  /** Error medio del target base, en % del precio. null si no hay vencidas. */
  errorMedioPct: number | null;
  /** No se pudieron leer las barras para puntuar. */
  sinDatos: boolean;
}

export interface ReportsIndex {
  filas: ReportRow[];
  /** Totales de toda la bitácora, no de un solo ticker. */
  totalReportes: number;
  totalVencidas: number;
  /** Acierto de dirección global, ponderado por nº de predicciones vencidas. */
  aciertoGlobal: number | null;
}

/** Lee los tickers que tienen bitácora. Devuelve [] si la carpeta no existe. */
export async function listReportTickers(): Promise<string[]> {
  try {
    const files = await fs.readdir(DATA_DIR);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  } catch {
    return [];
  }
}

async function readJournal(ticker: string): Promise<PredictionJournal | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${ticker}.json`), "utf8");
    return JSON.parse(raw) as PredictionJournal;
  } catch {
    return null;
  }
}

/**
 * Ritmo de descarga. Con 18 tickers de golpe se cayó el servidor de
 * desarrollo; con 4, Massive empezó a devolver cero barras a la mitad y la
 * bitácora daba "0 vencidas" en tickers que sí tenían 8 y 10 — un porcentaje
 * de acierto calculado sobre un tercio de los datos. De dos en dos, con pausa.
 * Es configurable para que las pruebas no tengan que esperar de verdad.
 */
export interface RitmoOpts {
  now?: Date;
  /** Tickers en paralelo. */
  tanda?: number;
  /** Pausa entre tandas y antes del reintento, en ms. */
  pausaMs?: number;
}
const TANDA = 2;
const PAUSA_MS = 350;

const dormir = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Ejecuta `fn` sobre `items` de N en N, con pausa entre tandas. */
async function enTandas<T, R>(items: T[], n: number, pausaMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    if (i > 0) await dormir(pausaMs);
    out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return out;
}

/**
 * Arma la bitácora completa. `fetchBars` se inyecta para poder probar esto sin
 * red: recibe un ticker y devuelve sus barras diarias (o [] si no se pudo).
 */
export async function buildReportsIndex(
  fetchBars: (ticker: string) => Promise<EvalBar[]>,
  opts: RitmoOpts = {},
): Promise<ReportsIndex> {
  const now = opts.now ?? new Date();
  const tanda = opts.tanda ?? TANDA;
  const pausaMs = opts.pausaMs ?? PAUSA_MS;
  const tickers = await listReportTickers();

  const filas = await enTandas(tickers, tanda, pausaMs, async (ticker): Promise<ReportRow | null> => {
      const journal = await readJournal(ticker);
      const snaps = journal?.snapshots ?? [];
      if (snaps.length === 0) return null;

      // Las fotos vienen "más reciente primero", pero no se da por hecho.
      const ordenadas = [...snaps].sort((a, b) => (a.date < b.date ? 1 : -1));
      const ultima = ordenadas[0];

      let bars = await fetchBars(ticker).catch(() => [] as EvalBar[]);
      if (bars.length === 0) {
        await dormir(pausaMs);
        bars = await fetchBars(ticker).catch(() => [] as EvalBar[]);
      }
      const sinDatos = bars.length === 0;
      const review: PredictionReview = reviewPredictions(ordenadas, bars, now);

      return {
        ticker,
        ultimaFecha: ultima.date,
        total: snaps.length,
        vencidas: review.maturedCount,
        spot: ultima.spot,
        bear: ultima.bear,
        base: ultima.base,
        bull: ultima.bull,
        direction: ultima.direction,
        confidence: ultima.confidence,
        aciertoDireccion: review.directionHitRate,
        errorMedioPct: review.meanAbsErrorPct,
        sinDatos,
      };
  });

  const limpias = filas.filter((f): f is ReportRow => f !== null)
    .sort((a, b) => (a.ultimaFecha < b.ultimaFecha ? 1 : -1));

  const totalReportes = limpias.reduce((s, f) => s + f.total, 0);
  const totalVencidas = limpias.reduce((s, f) => s + f.vencidas, 0);

  // Ponderado por vencidas: un ticker con 1 predicción no pesa igual que uno
  // con 12. Si nada ha vencido todavía, no hay porcentaje que dar.
  const conAcierto = limpias.filter((f) => f.aciertoDireccion != null && f.vencidas > 0);
  const pesoTotal = conAcierto.reduce((s, f) => s + f.vencidas, 0);
  const aciertoGlobal = pesoTotal > 0
    ? conAcierto.reduce((s, f) => s + (f.aciertoDireccion as number) * f.vencidas, 0) / pesoTotal
    : null;

  return { filas: limpias, totalReportes, totalVencidas, aciertoGlobal };
}
