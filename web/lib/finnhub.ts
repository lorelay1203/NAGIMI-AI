// Cliente de Finnhub — cotización en tiempo real (endpoint /quote). Solo servidor.
// Rellena el precio del subyacente que el stock snapshot de Massive no da (403).

const BASE_URL = "https://finnhub.io/api/v1";

export interface FinnhubQuote {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
}

/**
 * Cotización en tiempo real de una acción. Devuelve null si falta la key,
 * si el símbolo no existe, o ante cualquier error (para no romper el reporte).
 */
export async function fetchQuote(ticker: string): Promise<FinnhubQuote | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || !key.trim()) return null;
  const clean = ticker.trim().toUpperCase();
  if (!clean) return null;

  try {
    const url =
      `${BASE_URL}/quote?symbol=${encodeURIComponent(clean)}` +
      `&token=${encodeURIComponent(key.trim())}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const j = (await res.json()) as {
      c?: number; // current
      d?: number; // change
      dp?: number; // change %
      h?: number; // high
      l?: number; // low
      o?: number; // open
      pc?: number; // prev close
    };
    // Finnhub devuelve c=0 cuando el símbolo no tiene dato.
    if (!j || typeof j.c !== "number" || j.c === 0) return null;

    return {
      price: j.c ?? null,
      change: j.d ?? null,
      changePercent: j.dp ?? null,
      dayOpen: j.o ?? null,
      dayHigh: j.h ?? null,
      dayLow: j.l ?? null,
      prevClose: j.pc ?? null,
    };
  } catch {
    return null;
  }
}

// ── Calendario de earnings (para el agente de Catalizadores) ───────────────

export interface NextEarnings {
  /** Fecha del reporte, YYYY-MM-DD. */
  date: string;
  /** "bmo" antes de abrir, "amc" después del cierre, "dmh" durante, o null. */
  hour: string | null;
  epsEstimate: number | null;
}

/**
 * Próximo reporte de resultados de una acción, de Finnhub (fecha REAL, no la
 * estimación por cadencia). Devuelve null si falta la key, si es un ETF/índice
 * que no reporta, o ante cualquier error. Mira hasta ~130 días adelante.
 */
export async function fetchNextEarnings(ticker: string, now = new Date()): Promise<NextEarnings | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const clean = ticker.trim().toUpperCase();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 130 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `${BASE_URL}/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(clean)}&token=${key}`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as { earningsCalendar?: { date?: string; hour?: string; epsEstimate?: number | null }[] } | null;
  const list = (json?.earningsCalendar ?? [])
    .filter((e) => typeof e.date === "string")
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const next = list[0];
  if (!next?.date) return null;
  return {
    date: next.date,
    hour: next.hour || null,
    epsEstimate: typeof next.epsEstimate === "number" ? next.epsEstimate : null,
  };
}
