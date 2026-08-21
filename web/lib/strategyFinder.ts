// Buscador de estrategias que CABEN en el dinero disponible.
//
// Para un ticker y un presupuesto, arma varias estrategias (comprar call/put,
// spreads de débito, spreads de crédito, iron condor, cash-secured put) y calcula
// para cada una el CAPITAL que necesitas: lo que pagas (débito) o tu pérdida máxima
// (riesgo definido) o el colateral (venta de put). Devuelve las que caben, con su
// probabilidad de ganar, ganancia y pérdida máximas. Todo con precios reales de la cadena.

import { fetchMsGex } from "./marketsnackGex";
import { msFetch as msFetchAuto } from "./marketsnackFetch";
import { analyzeStrategy, type PayoffLeg } from "./payoff";

const BASE_URL = "https://app.marketsnack.com";
const MULT = 100; // 1 contrato = 100 acciones

function msFetch(path: string): Promise<Response> {
  return msFetchAuto(`${BASE_URL}${path}`);
}

interface RawContract {
  strike?: number;
  type?: "call" | "put";
  implied_volatility?: number | null;
  last_quote?: { bid?: number; ask?: number; mid?: number };
}

export type Direction = "alcista" | "bajista" | "neutral";

export interface StrategyResult {
  name: string;
  kind: string;
  direction: Direction;
  legsDesc: string[];       // patas en lenguaje llano
  capital: number;          // $ que necesitas (débito, pérdida máxima o colateral)
  maxGain: number | null;   // null = prácticamente ilimitado (compra suelta)
  maxLoss: number;          // $ pérdida máxima
  pop: number;              // 0-1
  breakevens: number[];
  note: string;
}

export interface FinderResult {
  ticker: string;
  spot: number;
  expiration: string;
  dte: number;
  ivPct: number;
  budget: number;
  fits: StrategyResult[];
  tooExpensive: { name: string; capital: number; direction: Direction }[];
}

function mid(c: RawContract): number {
  const bid = c.last_quote?.bid ?? 0, ask = c.last_quote?.ask ?? 0;
  return Math.max(0, c.last_quote?.mid ?? (bid + ask) / 2);
}

function nearest(strikes: number[], target: number): number {
  return strikes.reduce((b, s) => (Math.abs(s - target) < Math.abs(b - target) ? s : b), strikes[0]);
}

function medianStep(strikes: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < strikes.length; i++) d.push(strikes[i] - strikes[i - 1]);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)] || 1;
}

function todayET(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type FinderTerm = "1dte" | "corto" | "mes";
// Ventanas de vencimiento por plazo. "1dte" = la próxima expiración (mañana entre
// semana, lunes si es viernes), NUNCA el mismo día. Es el default (prioriza 1DTE).
const TERM_WINDOWS: Record<FinderTerm, { min: number; max: number; target: number }> = {
  "1dte": { min: 1, max: 5, target: 1 },
  "corto": { min: 3, max: 14, target: 7 },
  "mes": { min: 20, max: 45, target: 30 },
};

export async function findStrategies(
  ticker: string,
  budget: number,
  term: FinderTerm = "1dte",
  now: Date = new Date(),
): Promise<FinderResult | { error: string }> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return { error: "Falta el ticker." };
  if (!(budget > 0)) return { error: "El presupuesto debe ser mayor que 0." };

  const g = await fetchMsGex(clean).catch(() => null);
  const spot = g?.latest?.assetPrice ?? 0;
  if (!(spot > 0)) return { error: "No se pudo leer el precio del subyacente." };

  const expRes = await msFetch(`/api/assets/${encodeURIComponent(clean)}/expirations`);
  if (!expRes.ok) return { error: "No se pudieron leer los vencimientos." };
  const expJson = (await expRes.json()) as { date?: string }[];
  const dates = (expJson ?? []).map((e) => e.date).filter((d): d is string => !!d);
  const win = TERM_WINDOWS[term] ?? TERM_WINDOWS["1dte"];
  const dated = dates
    .map((d) => ({ d, dte: Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayET(now)}T00:00:00Z`)) / 86_400_000) }))
    .filter((x) => x.dte >= win.min && x.dte <= win.max)
    .sort((a, b) => Math.abs(a.dte - win.target) - Math.abs(b.dte - win.target));
  if (dated.length === 0) return { error: `No hay vencimientos en ${win.min}-${win.max} días para este ticker.` };

  const { d: expiration, dte } = dated[0];
  const res = await msFetch(`/api/assets/${encodeURIComponent(clean)}/option_chain_extended?expiration_date=${encodeURIComponent(expiration)}`);
  if (!res.ok) return { error: "No se pudo cargar la cadena de opciones." };
  const contracts = (await res.json()) as RawContract[];

  const callMid = new Map<number, number>();
  const putMid = new Map<number, number>();
  const strikeSet = new Set<number>();
  let ivAtm = 0, bestDist = Infinity;
  for (const c of contracts) {
    if (typeof c.strike !== "number") continue;
    const m = mid(c);
    strikeSet.add(c.strike);
    if (c.type === "call") callMid.set(c.strike, m);
    else if (c.type === "put") putMid.set(c.strike, m);
    const dist = Math.abs(c.strike - spot);
    if (c.implied_volatility && dist < bestDist) { bestDist = dist; ivAtm = c.implied_volatility; }
  }
  const strikes = [...strikeSet].sort((a, b) => a - b);
  if (strikes.length < 4 || !(ivAtm > 0)) return { error: "La cadena vino incompleta (sin IV o pocos strikes)." };

  const step = medianStep(strikes);
  const sd = spot * ivAtm * Math.sqrt(dte / 365);
  const priceOf = (t: "call" | "put", k: number) => (t === "call" ? callMid : putMid).get(k);

  // Strikes de referencia
  const atm = nearest(strikes, spot);
  const shortPutK = nearest(strikes, spot - sd);         // ~1σ abajo
  const longPutK = nearest(strikes, shortPutK - step);
  const shortCallK = nearest(strikes, spot + sd);        // ~1σ arriba
  const longCallK = nearest(strikes, shortCallK + step);
  const otmCallK = nearest(strikes, spot + step);        // 1 paso arriba (débito alcista)
  const otmPutK = nearest(strikes, spot - step);         // 1 paso abajo (débito bajista)

  // Cada plantilla: patas + descripción. Se valora y se mide el capital.
  interface Tpl { name: string; kind: string; direction: Direction; legs: { side: "buy" | "sell"; t: "call" | "put"; k: number }[]; capitalKind: "debito" | "riesgo" | "colateral"; note: string; }
  const templates: Tpl[] = [
    { name: "Comprar Call", kind: "long_call", direction: "alcista", capitalKind: "debito",
      legs: [{ side: "buy", t: "call", k: atm }], note: "Apuesta a que sube. Ganancia grande si sube fuerte; pierdes lo que pagas si no." },
    { name: "Comprar Put", kind: "long_put", direction: "bajista", capitalKind: "debito",
      legs: [{ side: "buy", t: "put", k: atm }], note: "Apuesta a que baja. Ganancia grande si baja fuerte; pierdes lo que pagas si no." },
    { name: "Spread de débito alcista (Bull Call)", kind: "bull_call", direction: "alcista", capitalKind: "debito",
      legs: [{ side: "buy", t: "call", k: atm }, { side: "sell", t: "call", k: otmCallK }], note: "Sube barato: compras un call y vendes otro más arriba para abaratarlo. Ganancia topada." },
    { name: "Spread de débito bajista (Bear Put)", kind: "bear_put", direction: "bajista", capitalKind: "debito",
      legs: [{ side: "buy", t: "put", k: atm }, { side: "sell", t: "put", k: otmPutK }], note: "Baja barato: compras un put y vendes otro más abajo para abaratarlo. Ganancia topada." },
    { name: "Credit Put Spread (alcista/neutral)", kind: "put_credit", direction: "alcista", capitalKind: "riesgo",
      legs: [{ side: "sell", t: "put", k: shortPutK }, { side: "buy", t: "put", k: longPutK }], note: "Cobras prima si NO baja de cierto nivel. Riesgo topado." },
    { name: "Credit Call Spread (bajista/neutral)", kind: "call_credit", direction: "bajista", capitalKind: "riesgo",
      legs: [{ side: "sell", t: "call", k: shortCallK }, { side: "buy", t: "call", k: longCallK }], note: "Cobras prima si NO sube de cierto nivel. Riesgo topado." },
    { name: "Iron Condor (rango)", kind: "iron_condor", direction: "neutral", capitalKind: "riesgo",
      legs: [{ side: "sell", t: "put", k: shortPutK }, { side: "buy", t: "put", k: longPutK }, { side: "sell", t: "call", k: shortCallK }, { side: "buy", t: "call", k: longCallK }], note: "Cobras prima si se queda dentro de un rango. Riesgo topado en ambos lados." },
    { name: "Cash-Secured Put (Wheel)", kind: "csp", direction: "alcista", capitalKind: "colateral",
      legs: [{ side: "sell", t: "put", k: shortPutK }], note: "Vendes un put; si baja, compras 100 acciones. Necesita el efectivo del strike como respaldo." },
  ];

  const fits: StrategyResult[] = [];
  const tooExpensive: { name: string; capital: number; direction: Direction }[] = [];

  for (const tpl of templates) {
    // Construir patas con precios reales
    const legs: PayoffLeg[] = [];
    let ok = true;
    for (const l of tpl.legs) {
      if (longPutK >= shortPutK || longCallK <= shortCallK) { /* anchos válidos */ }
      const m = priceOf(l.t, l.k);
      if (m == null) { ok = false; break; }
      if (l.side === "sell" && !(m > 0)) { ok = false; break; } // vender debe dar prima
      legs.push({ side: l.side, optionType: l.t, strike: l.k, quantity: 1, limitPrice: m });
    }
    if (!ok || legs.length === 0) continue;

    const a = analyzeStrategy(legs, spot, ivAtm, dte);
    const entryNet = legs.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * l.limitPrice * MULT * l.quantity, 0);
    const maxLoss = Math.abs(a.maxLoss);

    // Capital requerido según el tipo de estrategia
    let capital: number;
    if (tpl.capitalKind === "debito") capital = Math.max(0, entryNet);        // lo que pagas
    else if (tpl.capitalKind === "colateral") capital = tpl.legs[0].k * MULT - Math.max(0, -entryNet); // strike*100 − prima
    else capital = maxLoss;                                                    // riesgo definido

    if (!(capital > 0) || a.maxGain <= 0) continue;

    // ¿Compra suelta? ganancia "ilimitada" hacia arriba/abajo.
    const unlimited = tpl.kind === "long_call" || tpl.kind === "long_put";

    const legsDesc = tpl.legs.map((l) => {
      const verbo = l.side === "buy" ? "Compras" : "Vendes";
      return `${verbo} ${l.t === "call" ? "CALL" : "PUT"} $${l.k}`;
    });

    const item: StrategyResult = {
      name: tpl.name, kind: tpl.kind, direction: tpl.direction, legsDesc,
      capital: Math.round(capital), maxGain: unlimited ? null : Math.round(a.maxGain),
      maxLoss: Math.round(maxLoss), pop: a.pop,
      breakevens: a.breakevens.slice().sort((x, y) => x - y).map((b) => Math.round(b * 100) / 100),
      note: tpl.note,
    };

    if (capital <= budget) fits.push(item);
    else tooExpensive.push({ name: tpl.name, capital: Math.round(capital), direction: tpl.direction });
  }

  // Las que caben: primero mejor relación premio/riesgo, con POP como desempate.
  fits.sort((a, b) => {
    const rrA = (a.maxGain ?? a.maxLoss) / a.maxLoss;
    const rrB = (b.maxGain ?? b.maxLoss) / b.maxLoss;
    if (Math.abs(rrB - rrA) > 0.01) return rrB - rrA;
    return b.pop - a.pop;
  });

  return { ticker: clean, spot, expiration, dte, ivPct: Math.round(ivAtm * 100), budget, fits, tooExpensive };
}
