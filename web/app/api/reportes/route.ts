// GET /api/reportes → la bitácora completa: todas las predicciones guardadas,
// de todos los tickers, ya contrastadas con lo que el precio hizo después.

import { cachedDailyBars } from "@/lib/barsStore";
import { buildReportsIndex } from "@/lib/reportsIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Caché en memoria por encima de la de disco. La bitácora no cambia por minuto. */
const TTL_MS = 15 * 60_000;
let cache: { at: number; data: unknown } | null = null;

/** Tope por ticker. Los que Massive no sirve se quedaban colgados y una sola
 *  bitácora tardaba más de dos minutos por culpa de dos símbolos. */
const TOPE_MS = 10_000;

async function conTope<T>(p: Promise<T>, siTarda: T): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((res) => { t = setTimeout(() => res(siTarda), TOPE_MS); }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.data);
  try {
    // cachedDailyBars guarda en disco por día de mercado: la primera visita
    // del día paga la descarga, el resto son lecturas de fichero. Sin esto la
    // bitácora tardaba 3 minutos en armarse.
    const index = await buildReportsIndex(async (ticker) => {
      const bars = await conTope(cachedDailyBars(ticker, 200), []);
      return bars.map((b) => ({ time: b.time, high: b.high, low: b.low, close: b.close }));
    }, {});
    cache = { at: Date.now(), data: index };
    return Response.json(index);
  } catch {
    return Response.json({ error: "No se pudo leer la bitácora." }, { status: 502 });
  }
}
