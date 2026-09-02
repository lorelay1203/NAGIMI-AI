// ============================================================================
// "La sesión de hoy" — capa INTRADÍA independiente del análisis de swing.
// Arma, para un ticker: niveles de la sesión (VWAP, rango de apertura, máx/mín,
// ATR, apertura/cierre previo), el canal de gamma en vivo (muros + posición) y
// un veredicto de sesión (score /10 + sesgo). El flujo/prints ("Dinero de hoy")
// se llena aparte con MarketSnack (necesita cookie); aquí va como null si no hay.
//
// Datos de velas: Massive 5-min (DELAYED). Muros: lib/dayGex (Massive/MarketSnack).
// Todo con fines de estudio; no es consejo financiero.
// ============================================================================

import { fetchIntradayBars, fetchDailyBars, type IntradayBar } from "./massive";
import { getDayGex, type GexSource } from "./dayGex";
import { fetchFlow } from "./marketsnack";
import { classifyFlow } from "./flow";
import { analyzeMarketPressure } from "./marketPressure";

export interface ScoreCard { score: number; note: string }

export interface PrintRow { strike: number; total: number; call: number; put: number; side: "PUTS" | "CALLS" }
export interface PrintsData { count: number; premiumTotal: number; byStrike: PrintRow[] }

function fmtMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
}

export interface DaySession {
  ticker: string;
  sessionDate: string;   // YYYY-MM-DD (ET) de los datos mostrados
  delayed: boolean;      // Massive viene con retraso
  price: number;

  // Veredicto
  score: number;         // 0-10
  bias: "alcista" | "bajista" | "neutral";
  regime: "positive" | "negative";
  regimeNote: string;

  // Tarjetas score
  flow: ScoreCard | null;        // null = falta cookie de MarketSnack
  aggression: ScoreCard | null;  // null = falta cookie
  vwapCard: ScoreCard;
  channelCard: ScoreCard;

  // Niveles de la sesión
  vwap: number | null;
  vwapDelta: number | null;      // price − vwap
  openRangeLow: number | null;
  openRangeHigh: number | null;
  openRangeClosed: boolean;
  dayHigh: number | null;
  dayLow: number | null;
  rangePct: number | null;       // (máx−mín)/cierrePrevio
  atrPct: number | null;         // ATR14 / precio
  open: number | null;
  prevClose: number | null;

  // Canal de gamma
  callWall: number | null;
  magnet: number | null;
  putWall: number | null;
  channelPct: number | null;     // 0=pegado al put wall · 100=pegado al call wall
  callWallDeltaPct: number | null;
  putWallDeltaPct: number | null;
  gexSource: GexSource;

  // Dinero de hoy (prints) — flujo real de MarketSnack (null si no hay cookie)
  prints: PrintsData | null;
}

/** Fecha (YYYY-MM-DD) en horario del este (ET) de un epoch ms. */
function etDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
/** Minutos desde medianoche ET de un epoch ms (para detectar 9:30–10:00). */
function etMinutes(ms: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  const m = Number(p.find((x) => x.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** ATR de 14 días (Wilder simple) desde barras diarias. */
function atr14(daily: { high: number; low: number; close: number }[]): number | null {
  if (daily.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    const c = daily[i - 1].close;
    trs.push(Math.max(daily[i].high - daily[i].low, Math.abs(daily[i].high - c), Math.abs(daily[i].low - c)));
  }
  const w = trs.slice(-14);
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function getDaySession(ticker: string): Promise<DaySession> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new Error("Ticker vacío.");

  // Muros de gamma (Massive o MarketSnack). Es el ancla mínima.
  const gex = await getDayGex(clean);

  // Velas 5-min (con retraso) + diarias para ATR/cierre previo.
  const [intraday, daily] = await Promise.all([
    fetchIntradayBars(clean, 5, 7).catch(() => [] as IntradayBar[]),
    fetchDailyBars(clean, 40).catch(() => []),
  ]);

  // Sesión = la ÚLTIMA fecha ET con suficientes velas (evita agarrar "hoy" cuando
  // los datos con retraso aún no llegaron y saldría todo vacío).
  let sessionBars: IntradayBar[] = [];
  let sessionDate = etDate(Date.now());
  if (intraday.length) {
    const byDate = new Map<string, IntradayBar[]>();
    for (const b of intraday) {
      const dt = etDate(b.t);
      const arr = byDate.get(dt) ?? [];
      arr.push(b); byDate.set(dt, arr);
    }
    const dates = [...byDate.keys()].sort(); // ascendente
    for (let i = dates.length - 1; i >= 0; i--) {
      const arr = byDate.get(dates[i])!;
      if (arr.length >= 10) { sessionDate = dates[i]; sessionBars = arr; break; }
    }
    if (!sessionBars.length && dates.length) { // respaldo: la última que haya
      sessionDate = dates[dates.length - 1];
      sessionBars = byDate.get(sessionDate)!;
    }
  }

  // Niveles desde las velas de la sesión.
  let vwap: number | null = null, open: number | null = null;
  let dayHigh: number | null = null, dayLow: number | null = null;
  let orLow: number | null = null, orHigh: number | null = null;
  let price = gex.spot;
  if (sessionBars.length) {
    open = sessionBars[0].o;
    price = sessionBars[sessionBars.length - 1].c;
    dayHigh = Math.max(...sessionBars.map((b) => b.h));
    dayLow = Math.min(...sessionBars.map((b) => b.l));
    let pv = 0, vv = 0;
    for (const b of sessionBars) { pv += b.vw * b.v; vv += b.v; }
    vwap = vv > 0 ? pv / vv : null;
    // Rango de apertura = primeros 30 min (9:30–10:00 ET).
    const orBars = sessionBars.filter((b) => { const m = etMinutes(b.t); return m >= 570 && m < 600; });
    if (orBars.length) { orHigh = Math.max(...orBars.map((b) => b.h)); orLow = Math.min(...orBars.map((b) => b.l)); }
  }

  // Cierre previo = último cierre diario ANTES de la sesión.
  let prevClose: number | null = null;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].time < sessionDate) { prevClose = daily[i].close; break; }
  }
  if (prevClose == null && daily.length >= 2) prevClose = daily[daily.length - 2].close;

  const atr = atr14(daily);
  const atrPct = atr != null && price > 0 ? (atr / price) * 100 : null;
  const rangePct = dayHigh != null && dayLow != null && prevClose ? ((dayHigh - dayLow) / prevClose) * 100 : null;

  // ── Canal de gamma ──
  const { callWall, putWall, magnet } = gex;
  let channelPct: number | null = null;
  if (callWall != null && putWall != null && callWall > putWall) {
    channelPct = clamp(((price - putWall) / (callWall - putWall)) * 100, 0, 100);
  }
  const callWallDeltaPct = callWall != null && price > 0 ? ((callWall - price) / price) * 100 : null;
  const putWallDeltaPct = putWall != null && price > 0 ? ((putWall - price) / price) * 100 : null;

  // ── Tarjetas score ──
  // Precio vs VWAP: arriba = alcista (score alto), abajo = bajista.
  const vwapDelta = vwap != null ? price - vwap : null;
  let vwapScore = 5;
  if (vwap != null && vwap > 0) vwapScore = clamp(5 + ((price - vwap) / vwap) * 500, 0, 10);
  const vwapCard: ScoreCard = {
    score: Math.round(vwapScore * 10) / 10,
    note: vwap == null ? "sin datos de VWAP"
      : vwapDelta! >= 0 ? `por encima · VWAP ${vwap.toFixed(2)}` : `por debajo · VWAP ${vwap.toFixed(2)}`,
  };
  // Canal de gamma: pegado al suelo = score bajo; al techo = alto.
  const channelScore = channelPct != null ? channelPct / 10 : 5;
  const channelCard: ScoreCard = {
    score: Math.round(channelScore * 10) / 10,
    note: channelPct == null ? "sin canal definido"
      : channelPct <= 20 ? "cerca del suelo"
      : channelPct >= 80 ? "cerca del techo"
      : "en medio del canal",
  };

  // ── Flujo real de MarketSnack (Flujo de hoy, Agresividad, Dinero de hoy) ──
  let flow: ScoreCard | null = null;
  let aggression: ScoreCard | null = null;
  let prints: PrintsData | null = null;
  try {
    const { trades } = await fetchFlow(clean, { period: "1d", minPremium: 25_000, maxPages: 6 });
    const { rows } = classifyFlow(trades, new Date());
    const use = rows.filter((r) => r.premium > 0 && r.strike != null);
    if (use.length) {
      // Agresividad: % de la prima ejecutada AL ASK.
      let askPrem = 0, totalPrem = 0;
      for (const r of use) { totalPrem += r.premium; if (r.aggression === "ask") askPrem += r.premium; }
      const askPct = totalPrem > 0 ? (askPrem / totalPrem) * 100 : 0;
      aggression = { score: Math.round((askPct / 10) * 10) / 10, note: `${Math.round(askPct)}% al ask` };

      // Flujo: prima alcista (comprar calls o vender puts) vs bajista. La regla
      // vive en marketPressure.ts para no tenerla duplicada en dos sitios.
      const pressure = analyzeMarketPressure(use);
      const bull = pressure.cross.callsBought + pressure.cross.putsSold;
      const bear = pressure.cross.callsSold + pressure.cross.putsBought;
      const net = bull + bear;
      const bullPct = net > 0 ? bull / net : 0.5;
      flow = {
        score: Math.round(bullPct * 10 * 10) / 10,
        note: `${bullPct >= 0.55 ? "alcista" : bullPct <= 0.45 ? "bajista" : "mixto"} · ${fmtMoney(totalPrem)} en prima`,
      };

      // Dinero de hoy: prints agregados por strike.
      const byStrike = new Map<number, { call: number; put: number }>();
      for (const r of use) {
        const s = byStrike.get(r.strike!) ?? { call: 0, put: 0 };
        if (r.type === "call") s.call += r.premium; else if (r.type === "put") s.put += r.premium;
        byStrike.set(r.strike!, s);
      }
      const rowsArr: PrintRow[] = [...byStrike.entries()]
        .map(([strike, v]) => ({ strike, call: v.call, put: v.put, total: v.call + v.put, side: (v.put > v.call ? "PUTS" : "CALLS") as "PUTS" | "CALLS" }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);
      prints = { count: use.length, premiumTotal: totalPrem, byStrike: rowsArr };
    }
  } catch { /* sin cookie o error → flow/aggression/prints quedan null */ }

  // ── Veredicto: promedio de las señales disponibles ──
  const parts = [vwapCard.score, channelCard.score];
  if (flow) parts.push(flow.score);
  if (aggression) parts.push(aggression.score);
  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
  const bias: DaySession["bias"] = score >= 6 ? "alcista" : score <= 4 ? "bajista" : "neutral";
  const regimeNote = gex.regime === "positive"
    ? "Gamma positiva: la sesión tiende a RANGO — los movimientos tienden a frenarse en los muros."
    : "Gamma negativa: la sesión tiende a TENDENCIA — los movimientos se aceleran en lugar de frenarse.";

  return {
    ticker: clean, sessionDate, delayed: true, price,
    score, bias, regime: gex.regime, regimeNote,
    flow, aggression, vwapCard, channelCard,
    vwap, vwapDelta,
    openRangeLow: orLow, openRangeHigh: orHigh, openRangeClosed: true,
    dayHigh, dayLow, rangePct, atrPct,
    open, prevClose,
    callWall, magnet, putWall, channelPct, callWallDeltaPct, putWallDeltaPct,
    gexSource: gex.source,
    prints,
  };
}
