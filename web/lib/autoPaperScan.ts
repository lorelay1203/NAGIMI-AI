// Motor automático de PAPER TRADING (simulado, sin dinero real, sin broker).
//
// Escanea el mercado una vez al día buscando estructuras de PROBABILIDAD ALTA
// (POP ≥ objetivo, por defecto 90%) — venta de prima OTM tipo iron condor — y
// registra 1 contrato de cada una en el diario de paper. El objetivo NO es ganar
// dinero (es simulado): es MEDIR si el "90%" se cumple de verdad con el tiempo.
//
// Prioriza SPY, que además es el ESPEJO de /ES y /MES (mismo índice S&P). /ES y
// /MES no están en el feed de datos (solo acciones/ETF), así que se siguen a
// través de SPY: el resultado de la apuesta es idéntico, solo cambia la escala.

import { fetchMarketFlow } from "./marketsnack";
import { msFetch as msFetchAuto } from "./marketsnackFetch";
import { fetchMsGex, type MsGexResult } from "./marketsnackGex";
import { parseOcc } from "./occ";
import { generateLegs } from "./orderBuilder";
import { analyzeStrategy, type PayoffLeg } from "./payoff";
import { openPaper, listPaper, type PaperLeg } from "./paper";

interface RawContract {
  strike?: number;
  type?: "call" | "put";
  implied_volatility?: number | null;
  last_quote?: { bid?: number; ask?: number; mid?: number };
}

export interface ScanCandidate {
  ticker: string;
  label: string;
  expiration: string;
  dte: number;
  legs: PayoffLeg[];
  pop: number;          // 0-1
  maxLoss: number;      // $ por estructura (positivo)
  maxGain: number;      // $ crédito recibido
  entryNet: number;     // neto por contrato (<0 = crédito)
  spot: number;
  note: string;
  rationale: string;    // explicación larga del porqué (se ve al tocar el trade)
}

export interface ScanResult {
  ranAt: string;                 // ISO
  scanned: number;               // tickers revisados
  candidates: ScanCandidate[];   // encontrados con POP ≥ objetivo
  registered: number;            // cuántos se registraron nuevos en paper
  popTarget: number;
  maxRisk: number;               // límite de pérdida máxima por trade ($)
  minReturn: number;             // ganancia mínima como fracción del riesgo (0.25 = 25%)
  skipped: { ticker: string; reason: string }[];
}

const MULT = 100; // 1 contrato = 100 acciones
const BASE_URL = "https://app.marketsnack.com";

/** Igual que el wrapper de marketsnackChain: antepone la base y auto-relogin en 401. */
function msFetch(path: string): Promise<Response> {
  return msFetchAuto(`${BASE_URL}${path}`);
}

/** Mid de un contrato de la cadena. */
function mid(c: RawContract): number {
  const bid = c.last_quote?.bid ?? 0, ask = c.last_quote?.ask ?? 0;
  return c.last_quote?.mid ?? (bid + ask) / 2;
}

/** Strike disponible más cercano a `target`. */
function nearestStrike(strikes: number[], target: number): number {
  return strikes.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), strikes[0]);
}

type Trend = "up" | "down" | "neutral";

/**
 * Tendencia que "ve" el agente, a partir del GEX (datos confiables): precio vs
 * gamma flip (arriba = sesgo alcista/estable), vs imán (debajo = jala hacia
 * arriba), y la dirección del precio en el día. Suma de votos → alcista/bajista/neutral.
 */
function gexTrend(g: MsGexResult | null): Trend {
  const L = g?.latest;
  if (!L || !(L.assetPrice > 0)) return "neutral";
  let sum = 0;
  if (L.gammaFlip > 0) sum += L.assetPrice >= L.gammaFlip ? 1 : -1;
  if (L.magnet > 0) sum += L.assetPrice <= L.magnet ? 1 : -1;
  const first = g?.series?.[0]?.assetPrice ?? 0;
  if (first > 0) sum += L.assetPrice > first * 1.001 ? 1 : L.assetPrice < first * 0.999 ? -1 : 0;
  return sum > 0 ? "up" : sum < 0 ? "down" : "neutral";
}

/** ¿La tendencia del agente APOYA este tipo de trade? */
function trendConfirms(kind: "iron_condor" | "put_credit" | "call_credit", trend: Trend): boolean {
  if (kind === "put_credit") return trend !== "down"; // apuesta a que NO baja → no ir contra una bajada
  if (kind === "call_credit") return trend !== "up";  // apuesta a que NO sube → no ir contra una subida
  return trend === "neutral";                          // iron condor (rango) → solo cuando no hay tendencia
}

function trendLabel(t: Trend): string {
  return t === "up" ? "ALCISTA ↑" : t === "down" ? "BAJISTA ↓" : "NEUTRAL →";
}

/**
 * Busca un iron condor de POP alto para un ticker. Coloca los cortos a ~`sigmas`
 * desviaciones del precio (mientras más lejos, más POP) y las alas un paso más
 * afuera. Sube las sigmas hasta alcanzar el POP objetivo.
 */
type FindResult = { ok: ScanCandidate } | { skip: string };

async function findHighPopCondor(
  ticker: string,
  popTarget: number,
  maxRisk: number,
  minReturn: number,
  now: Date,
): Promise<FindResult> {
  const g = await fetchMsGex(ticker).catch(() => null);
  const spot = g?.latest?.assetPrice ?? 0;
  if (!(spot > 0)) return { skip: "sin precio del subyacente" };
  const trend = gexTrend(g); // la tendencia que ve el agente (para confirmar el trade)

  const expRes = await msFetch(`/api/assets/${encodeURIComponent(ticker)}/expirations`);
  if (!expRes.ok) return { skip: "sin vencimientos" };
  const expJson = (await expRes.json()) as { date?: string }[];
  const dates = (expJson ?? []).map((e) => e.date).filter((d): d is string => !!d);

  // Ventana ideal para venta de prima: 10-45 días (theta trabaja, sin ser 0DTE).
  const dated = dates
    .map((d) => ({ d, dte: Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayET(now)}T00:00:00Z`)) / 86_400_000) }))
    .filter((x) => x.dte >= 10 && x.dte <= 45)
    .sort((a, b) => Math.abs(a.dte - 28) - Math.abs(b.dte - 28)); // preferimos ~4 semanas
  if (dated.length === 0) return { skip: "sin vencimiento en 10-45 días" };

  const { d: expiration, dte } = dated[0];
  const res = await msFetch(`/api/assets/${encodeURIComponent(ticker)}/option_chain_extended?expiration_date=${encodeURIComponent(expiration)}`);
  if (!res.ok) return { skip: "no cargó la cadena" };
  const contracts = (await res.json()) as RawContract[];

  const callMid = new Map<number, number>();
  const putMid = new Map<number, number>();
  const strikeSet = new Set<number>();
  let ivAtm = 0, bestDist = Infinity;
  for (const c of contracts) {
    if (typeof c.strike !== "number") continue;
    const m = mid(c);
    strikeSet.add(c.strike);
    // Registramos incluso mid 0 (alas muy OTM valen ~0 y aun así definen el riesgo).
    if (c.type === "call") callMid.set(c.strike, Math.max(0, m));
    else if (c.type === "put") putMid.set(c.strike, Math.max(0, m));
    const dist = Math.abs(c.strike - spot);
    if (c.implied_volatility && dist < bestDist) { bestDist = dist; ivAtm = c.implied_volatility; }
  }
  const strikes = [...strikeSet].sort((a, b) => a - b);
  if (strikes.length < 4 || !(ivAtm > 0)) return { skip: "cadena incompleta" };

  const step = medianStep(strikes);
  const T = dte / 365;
  const sd = spot * ivAtm * Math.sqrt(T); // 1σ esperado en $

  type Kind = "iron_condor" | "put_credit" | "call_credit";
  interface Best {
    kind: Kind; legs: PayoffLeg[]; a: ReturnType<typeof analyzeStrategy>; maxLoss: number;
    sig: number; shortPut: number; longPut: number; shortCall: number; longCall: number; score: number;
  }
  let cheapestOverBudget = Infinity; // el riesgo más chico que SÍ llegó a POP pero no cupo
  let best: Best | null = null;
  let trendBlocked = false; // hubo candidatos pero la tendencia no los apoyó
  let lowReturn = false;    // hubo candidatos pero pagaban menos del mínimo

  // Prueba 3 tipos de trade a varias distancias. Incluye cortos más cercanos
  // (0.4-0.8σ) para POP ~60-75% con premio decente, no solo los muy lejanos.
  for (const sig of [0.4, 0.6, 0.8, 1.0, 1.3, 1.6, 2.0]) {
    const shortPut = nearestStrike(strikes, spot - sig * sd);
    const shortCall = nearestStrike(strikes, spot + sig * sd);
    const longPut = nearestStrike(strikes, shortPut - step);
    const longCall = nearestStrike(strikes, shortCall + step);

    const specs: { kind: Kind; width: number; defs: { side: "sell" | "buy"; optionType: "put" | "call"; strike: number }[] }[] = [];
    if (longPut < shortPut && longCall > shortCall) {
      specs.push({ kind: "iron_condor", width: Math.min(shortPut - longPut, longCall - shortCall), defs: [
        { side: "sell", optionType: "put", strike: shortPut }, { side: "buy", optionType: "put", strike: longPut },
        { side: "sell", optionType: "call", strike: shortCall }, { side: "buy", optionType: "call", strike: longCall },
      ] });
    }
    if (longPut < shortPut) {
      specs.push({ kind: "put_credit", width: shortPut - longPut, defs: [
        { side: "sell", optionType: "put", strike: shortPut }, { side: "buy", optionType: "put", strike: longPut },
      ] });
    }
    if (longCall > shortCall) {
      specs.push({ kind: "call_credit", width: longCall - shortCall, defs: [
        { side: "sell", optionType: "call", strike: shortCall }, { side: "buy", optionType: "call", strike: longCall },
      ] });
    }

    for (const spec of specs) {
      // Confirmación de tendencia: el agente solo entra a favor de lo que ve.
      if (!trendConfirms(spec.kind, trend)) { trendBlocked = true; continue; }

      const legs: PayoffLeg[] = [];
      let ok = true;
      for (const l of spec.defs) {
        const m = (l.optionType === "call" ? callMid : putMid).get(l.strike);
        if (m == null) { ok = false; break; }
        if (l.side === "sell" && !(m > 0)) { ok = false; break; } // lo que vendemos debe dar prima real
        legs.push({ side: l.side, optionType: l.optionType, strike: l.strike, quantity: 1, limitPrice: m });
      }
      if (!ok) continue;

      const a = analyzeStrategy(legs, spot, ivAtm, dte);
      if (a.pop < popTarget) continue;
      const maxLoss = Math.abs(a.maxLoss);
      if (!(maxLoss > 0) || a.maxGain <= 0) continue;

      // Sensatez anti-basura (cadenas ilíquidas dan "gana $99 / pierde $2", imposible).
      const widthDollars = spec.width * MULT;
      if (a.maxGain > 0.6 * widthDollars) continue;
      if (maxLoss < Math.max(15, 0.25 * widthDollars)) continue;
      // Ganancia mínima: la prima debe ser al menos `minReturn` de lo que se arriesga
      // (p.ej. 25% → por cada $100 en riesgo, cobras ≥$25). Evita migajas.
      if (a.maxGain < minReturn * maxLoss) { lowReturn = true; continue; }

      // Filtro de cuenta chica: la pérdida máxima tiene que caber en el capital.
      if (maxLoss > maxRisk) { cheapestOverBudget = Math.min(cheapestOverBudget, maxLoss); continue; }

      // Ya todos superan el POP objetivo → gana el que MEJOR paga por dólar arriesgado.
      const score = a.maxGain / maxLoss;
      if (!best || score > best.score) {
        best = { kind: spec.kind, legs, a, maxLoss, sig, shortPut, longPut, shortCall, longCall, score };
      }
    }
  }

  if (!best) {
    if (cheapestOverBudget < Infinity) return { skip: `no cabe: arriesga $${Math.round(cheapestOverBudget)} (tu límite $${Math.round(maxRisk)})` };
    if (lowReturn) return { skip: `paga menos del ${Math.round(minReturn * 100)}% mínimo de ganancia` };
    if (trendBlocked) return { skip: `la tendencia (${trendLabel(trend)}) no apoya ningún trade` };
    return { skip: `sin estructura ≥${Math.round(popTarget * 100)}% POP` };
  }

  const { kind, legs, a, maxLoss, sig, shortPut, longPut, shortCall, longCall } = best;
  const entryNet = legs.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * l.limitPrice * MULT * l.quantity, 0);
  const credit = Math.round(a.maxGain);
  const be = a.breakevens.slice().sort((x, y) => x - y);
  // Gestión para cuenta chica: toma ganancia a la mitad de la prima; corta la
  // pérdida a 2× la prima cobrada, sin pasar de la pérdida máxima.
  const takeProfit = Math.max(1, Math.round(credit * 0.5));
  const stopLoss = Math.min(Math.round(maxLoss), Math.round(credit * 2));
  const stopPct = maxRisk > 0 ? Math.round((stopLoss / maxRisk) * 100) : 0;

  const fullName: Record<Kind, string> = {
    iron_condor: "IRON CONDOR (apuesta a un RANGO)",
    put_credit: "CREDIT PUT SPREAD · alcista/neutral (apuesta a que NO baja)",
    call_credit: "CREDIT CALL SPREAD · bajista/neutral (apuesta a que NO sube)",
  };
  const shortName: Record<Kind, string> = { iron_condor: "Iron Condor", put_credit: "Credit Put Spread", call_credit: "Credit Call Spread" };
  const label =
    kind === "iron_condor" ? `Iron Condor ${putStr(longPut, shortPut)} · ${callStr(shortCall, longCall)} · ${expiration}`
    : kind === "put_credit" ? `Credit Put Spread (alcista) ${putStr(longPut, shortPut)} · ${expiration}`
    : `Credit Call Spread (bajista) ${callStr(shortCall, longCall)} · ${expiration}`;
  const comoGanas =
    kind === "iron_condor" ? `Ganas si ${ticker} se queda ENTRE ${shortPut} y ${shortCall} hasta el ${expiration}.`
    : kind === "put_credit" ? `Ganas si ${ticker} se queda POR ENCIMA de ${shortPut} hasta el ${expiration}.`
    : `Ganas si ${ticker} se queda POR DEBAJO de ${shortCall} hasta el ${expiration}.`;
  const patas =
    kind === "iron_condor" ? [
      `• Vendes put ${shortPut} / compras put ${longPut}  (piso protegido).`,
      `• Vendes call ${shortCall} / compras call ${longCall}  (techo protegido).`,
    ]
    : kind === "put_credit" ? [`• Vendes put ${shortPut} / compras put ${longPut}  (por debajo, para limitar la pérdida).`]
    : [`• Vendes call ${shortCall} / compras call ${longCall}  (por encima, para limitar la pérdida).`];

  const rationale = [
    `Estrategia: ${fullName[kind]}. Cobras prima por adelantado y la conservas si el precio se porta como esperas.`,
    ``,
    `Por qué este trade:`,
    `• ✅ El agente confirma la tendencia ${trendLabel(trend)} — esta jugada va A FAVOR de eso, no en contra.`,
    `• Probabilidad de ganar (POP): ${Math.round(a.pop * 100)}%.`,
    `• La prima paga ${Math.round((a.maxGain / maxLoss) * 100)}% de lo que arriesgas.`,
    `• Los cortos se pusieron a ${sig}σ del precio: fuera de lo que la volatilidad (IV ${(ivAtm * 100).toFixed(0)}%) espera que se mueva.`,
    ...patas,
    `• ${comoGanas}`,
    be.length >= 1 ? `• Punto(s) de equilibrio: ${be.map((b) => b.toFixed(2)).join(" y ")}.` : ``,
    ``,
    `Números (1 contrato):`,
    `• Ganancia máxima: $${credit} (la prima).`,
    `• Pérdida máxima: $${Math.round(maxLoss)} (cabe en tu límite de $${Math.round(maxRisk)}).`,
    ``,
    `📏 Gestión recomendada (cuenta chica):`,
    `• TOMA GANANCIA al llevar +$${takeProfit} (la mitad de la prima). No seas avariciosa.`,
    `• STOP-LOSS: cierra si la pérdida llega a $${stopLoss} (≈${stopPct}% de tu límite). NO dejes que llegue a la pérdida máxima de $${Math.round(maxLoss)}.`,
    ``,
    `⚠️ POP ${Math.round(a.pop * 100)}% quiere decir que ~${100 - Math.round(a.pop * 100)} de cada 100 veces esto pierde. Menos POP paga más pero pierde más seguido. Por eso lo probamos en PAPEL: para ver si al final el saldo sube.`,
  ].filter((x) => x !== "").join("\n");

  return {
    ok: {
      ticker, label, expiration, dte, legs,
      pop: a.pop, maxLoss, maxGain: a.maxGain, entryNet, spot,
      note: `${shortName[kind]} · POP ${Math.round(a.pop * 100)}% · ${sig}σ · stop $${stopLoss}`,
      rationale,
    },
  };
}

function putStr(long: number, short: number): string { return `${long}/${short}p`; }
function callStr(short: number, long: number): string { return `${short}/${long}c`; }

/** Paso mediano entre strikes consecutivos (robusto ante huecos). */
function medianStep(strikes: number[]): number {
  const diffs = [];
  for (let i = 1; i < strikes.length; i++) diffs.push(strikes[i] - strikes[i - 1]);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 5;
}

function todayET(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Convierte las patas de payoff al formato del diario de paper. */
function toPaperLegs(legs: PayoffLeg[], expiration: string): PaperLeg[] {
  return legs.map((l) => ({ type: l.optionType, side: l.side, strike: l.strike, expiration, qty: l.quantity }));
}

// SPXW (semanal), SPXpm, etc. son el MISMO índice S&P que SPX. Los colapsamos
// para no registrar apuestas duplicadas del mismo subyacente.
function normalizeTicker(u: string): string {
  const up = u.toUpperCase();
  if (up === "SPXW" || up === "SPXPM") return "SPX";
  return up;
}

// Índices y ETFs demasiado caros para una cuenta chica: sus strikes están muy
// separados (SPX cada $25 → el spread más angosto ya arriesga $2,500). El filtro
// de riesgo los tumbaría igual, pero saltarlos aquí evita gastar el escaneo en ellos.
const TOO_EXPENSIVE = new Set(["SPX", "NDX", "RUT", "VIX"]);

/**
 * Universo a escanear: SPY primero (barato, $1 entre strikes → cabe en cuenta chica),
 * luego los nombres con más dinero en opciones hoy (todo el mercado), sin repetir.
 * Cap para que el escaneo diario no se dispare.
 */
async function buildUniverse(maxNames: number): Promise<string[]> {
  const priority = ["SPY"]; // el más barato del complejo S&P; QQQ/IWM entran por flujo si aplican
  try {
    const { trades } = await fetchMarketFlow({ period: "1d", maxPages: 3, minPremium: 500_000 });
    const byPremium = new Map<string, number>();
    for (const t of trades) {
      const info = parseOcc(t.symbol);
      if (!info) continue;
      const u = normalizeTicker(info.underlying);
      if (TOO_EXPENSIVE.has(u)) continue; // fuera del alcance de una cuenta chica
      byPremium.set(u, (byPremium.get(u) ?? 0) + (t.premium || 0));
    }
    const ranked = [...byPremium.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
    const out = [...priority];
    for (const u of ranked) {
      if (out.length >= maxNames) break;
      if (!out.includes(u)) out.push(u);
    }
    return out;
  } catch {
    return priority;
  }
}

/**
 * Corre el escaneo completo y registra en paper las estructuras nuevas.
 * Dedup: no re-registra si ya hay un trade ABIERTO del mismo ticker + vencimiento.
 */
export async function runAutoScan(opts: { popTarget?: number; maxNames?: number; maxRisk?: number; minReturn?: number; now?: Date } = {}): Promise<ScanResult> {
  const popTarget = opts.popTarget && opts.popTarget > 0 ? opts.popTarget : 0.6;
  const maxNames = opts.maxNames ?? 12;
  // Límite de pérdida máxima por trade. Por defecto $100 = tu cuenta chica.
  const maxRisk = opts.maxRisk && opts.maxRisk > 0 ? opts.maxRisk : 100;
  // Ganancia mínima como % del riesgo (25% por defecto). Por debajo, no vale la pena.
  const minReturn = opts.minReturn && opts.minReturn > 0 ? opts.minReturn : 0.25;
  const now = opts.now ?? new Date();

  const universe = await buildUniverse(maxNames);
  const open = (await listPaper()).filter((t) => t.status === "open");
  const candidates: ScanCandidate[] = [];
  const skipped: { ticker: string; reason: string }[] = [];
  let registered = 0;

  for (const ticker of universe) {
    let result: FindResult;
    try {
      result = await findHighPopCondor(ticker, popTarget, maxRisk, minReturn, now);
    } catch (e) {
      skipped.push({ ticker, reason: `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160) });
      continue;
    }
    if ("skip" in result) { skipped.push({ ticker, reason: result.skip }); continue; }
    const cand = result.ok;
    candidates.push(cand);

    const dup = open.some((t) => t.ticker === ticker && t.legs.some((l) => l.expiration === cand.expiration) && t.status === "open");
    if (dup) continue;

    await openPaper({
      ticker,
      label: cand.label,
      legs: toPaperLegs(cand.legs, cand.expiration),
      entryNet: Math.round((cand.entryNet / MULT) * 100) / 100, // por contrato, como el resto del diario
      qtyContracts: 1,
      entryTime: now.toISOString(),
      entrySpot: cand.spot,
      note: `🤖 auto · ${cand.note} · riesgo $${Math.round(cand.maxLoss)}`,
      rationale: cand.rationale,
      source: "motor",
    });
    registered += 1;
  }

  return { ranAt: now.toISOString(), scanned: universe.length, candidates, registered, popTarget, maxRisk, minReturn, skipped };
}
