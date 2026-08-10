// Institutional Flow Intelligence — lee CADA operación como lo haría una mesa
// institucional: Flow Score (0-100), premium, notional, moneyness, delta, DTE,
// bid/ask, OI-vs-volumen, smart money, dirección y "por qué importa".
// Funciones PURAS sobre un FlowRow. Material de estudio, no consejo financiero.

import type { FlowRow } from "./flow";

export interface ScoreComponent { label: string; score: number; max: number; note: string }
export interface Stars { count: number; tier: string }

export interface InstitutionalRead {
  flowScore: number;                 // 0-100
  grade: string;                     // A+ / A / B / C / D
  components: ScoreComponent[];
  premium: { value: number; stars: Stars };
  size: { contracts: number; shares: number; notional: number };
  moneyness: { label: string; pctFromSpot: number | null; note: string };
  delta: { value: number; read: string };
  dte: { value: number | null; bucket: string; note: string };
  bidAsk: { read: string; tone: "bull" | "bear" | "neutral" };
  oi: { volume: number; openInterest: number; read: string; newPosition: boolean };
  smartMoney: number;                // 0-100
  direction: { bullishPct: number; bearishPct: number; label: string };
  plainLanguage: string;
  whyItMatters: { grade: string; positives: string[]; missing: string[]; action: string };
  recommendation: "HIGH CONVICTION" | "WATCH" | "WAIT" | "IGNORE";
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const fmtM = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`);

// --- Componentes del Flow Score (suman 100) ---
function scorePremium(p: number): ScoreComponent {
  const s = p >= 5e6 ? 25 : p >= 1e6 ? 21 : p >= 5e5 ? 16 : p >= 25e4 ? 12 : p >= 1e5 ? 8 : p >= 5e4 ? 5 : 2;
  return { label: "Premium", score: s, max: 25, note: fmtM(p) };
}
function scoreSize(size: number): ScoreComponent {
  const s = size >= 2500 ? 15 : size >= 1000 ? 12 : size >= 500 ? 9 : size >= 150 ? 6 : size >= 50 ? 3 : 1;
  return { label: "Tamaño", score: s, max: 15, note: `${size.toLocaleString("en-US")} contratos` };
}
function scoreDelta(delta: number): ScoreComponent {
  const a = Math.abs(delta);
  const s = a >= 0.7 ? 12 : a >= 0.6 ? 10 : a >= 0.5 ? 8 : a >= 0.35 ? 5 : a >= 0.2 ? 3 : 1;
  return { label: "Delta (convicción)", score: s, max: 12, note: a.toFixed(2) };
}
function scoreDte(dte: number | null): ScoreComponent {
  const d = dte ?? 0;
  const s = d >= 365 ? 12 : d >= 180 ? 10 : d >= 90 ? 8 : d >= 30 ? 6 : d >= 7 ? 4 : 2;
  return { label: "Horizonte (DTE)", score: s, max: 12, note: `${d}d` };
}
function scoreOi(exceeded: boolean, vol: number, oi: number): ScoreComponent {
  const ratio = oi > 0 ? vol / oi : vol > 0 ? 5 : 0;
  const s = exceeded || ratio >= 5 ? 10 : ratio >= 2 ? 8 : ratio >= 1 ? 6 : ratio >= 0.3 ? 4 : 2;
  return { label: "Nueva posición (Vol/OI)", score: s, max: 10, note: `Vol ${vol} / OI ${oi}` };
}
function scoreAggr(aggr: string): ScoreComponent {
  const s = aggr === "ask" ? 10 : aggr === "bid" ? 4 : aggr === "mid" ? 5 : 3;
  return { label: "Agresividad (Bid/Ask)", score: s, max: 10, note: aggr };
}
function scoreRepeat(repeated: boolean): ScoreComponent {
  return { label: "Repetición (cluster)", score: repeated ? 8 : 2, max: 8, note: repeated ? "sí" : "no" };
}
function scoreLiquidity(bid: number, ask: number, price: number): ScoreComponent {
  const mid = ask > 0 && bid > 0 ? (ask + bid) / 2 : price;
  const spreadPct = mid > 0 && ask > 0 && bid > 0 ? ((ask - bid) / mid) * 100 : 100;
  const s = spreadPct < 2 ? 8 : spreadPct < 5 ? 6 : spreadPct < 10 ? 4 : 2;
  return { label: "Liquidez (spread)", score: s, max: 8, note: spreadPct < 100 ? `${spreadPct.toFixed(1)}%` : "s/d" };
}

function premiumStars(p: number): Stars {
  if (p >= 5e6) return { count: 5, tier: "Institutional Size" };
  if (p >= 1e6) return { count: 4, tier: "Large / institucional" };
  if (p >= 5e5) return { count: 3, tier: "Notable" };
  if (p >= 1e5) return { count: 2, tier: "Mediano" };
  return { count: 1, tier: "Pequeño / retail" };
}

function moneynessOf(row: FlowRow): { label: string; pctFromSpot: number | null; note: string } {
  const spot = row.assetPrice, k = row.strike;
  if (!spot || k == null) return { label: "s/d", pctFromSpot: null, note: "sin precio o strike" };
  // % que el strike está por encima/debajo del spot, orientado a la dirección del contrato.
  const raw = ((spot - k) / spot) * 100; // >0 = strike bajo el spot
  const dir = row.type === "put" ? -raw : raw; // para put, ITM cuando strike > spot
  const a = Math.abs(dir);
  let label: string;
  if (a <= 1.5) label = "ATM";
  else if (dir > 10) label = "Deep ITM";
  else if (dir > 1.5) label = "ITM";
  else if (dir < -10) label = "Deep OTM";
  else label = "OTM";
  const note =
    label.includes("ATM") ? "Justo en el precio: máxima gamma, apuesta al movimiento inmediato."
    : label.includes("Deep ITM") ? "Muy dentro: casi como comprar la acción con apalancamiento — convicción alta."
    : label.includes("ITM") ? "Dentro del dinero: paga más pero tiene delta alta — direccional serio."
    : label.includes("Deep OTM") ? "Muy fuera: barato, lotería o cobertura — bajísima prob. de acertar."
    : "Fuera del dinero: apuesta apalancada a que el precio se mueva a su favor.";
  return { label, pctFromSpot: Math.round(dir * 10) / 10, note };
}

function deltaRead(delta: number): string {
  const a = Math.abs(delta);
  if (a >= 0.7) return "Muy alta sensibilidad · alta probabilidad de terminar ITM · perfil institucional.";
  if (a >= 0.5) return "Sensibilidad equilibrada · direccional con convicción.";
  if (a >= 0.3) return "Sensibilidad moderada · apuesta apalancada, aún especulativa.";
  return "Delta baja · poca prob. de terminar ITM — lotería o cobertura, no convicción.";
}

function dteBucket(dte: number | null): { bucket: string; note: string } {
  const d = dte ?? 0;
  if (d >= 365) return { bucket: "LEAP · largo plazo", note: "Posición de convicción a 1+ año. La mano fuerte piensa en meses/años." };
  if (d >= 180) return { bucket: "Posición institucional", note: "Tiempo para que la tesis se desarrolle. Poco especulativo." };
  if (d >= 90) return { bucket: "Swing largo", note: "Movimiento esperado en 3-6 meses." };
  if (d >= 30) return { bucket: "Swing", note: "Apuesta a semanas. Equilibrio riesgo/tiempo." };
  if (d >= 7) return { bucket: "Corto plazo", note: "Alta especulación: el tiempo corre rápido." };
  return { bucket: "Lotería (0-7d)", note: "Vence casi ya. Theta brutal — pura especulación." };
}

function bidAskRead(aggr: string, type: string): { read: string; tone: "bull" | "bear" | "neutral" } {
  if (aggr === "ask") {
    return type === "put"
      ? { read: "Compró agresivo al ASK (puts) — pagó por urgencia bajista o cobertura.", tone: "bear" }
      : { read: "Compró agresivo al ASK — pagó por entrar YA. Urgencia alcista.", tone: "bull" };
  }
  if (aggr === "bid") {
    return type === "put"
      ? { read: "Ejecutó al BID (puts) — posible venta de puts = alcista, o cierre.", tone: "bull" }
      : { read: "Ejecutó al BID (calls) — posible venta de calls = bajista/cobertura, o cierre.", tone: "bear" };
  }
  return { read: "Negoció al medio — sin urgencia, esperó liquidez o fue negociado.", tone: "neutral" };
}

function smartMoney(row: FlowRow): number {
  const p = clamp(Math.log10(Math.max(row.premium, 1)) / 7, 0, 1);       // ~$10M = 1
  const d = clamp((row.dte ?? 0) / 365, 0, 1);
  const dl = clamp(Math.abs(row.delta) / 0.8, 0, 1);
  const rep = row.flags?.repeated ? 1 : 0.3;
  const mid = row.ask > 0 && row.bid > 0 ? (row.ask + row.bid) / 2 : row.price;
  const spread = mid > 0 && row.ask > 0 && row.bid > 0 ? clamp(1 - (row.ask - row.bid) / mid / 0.1, 0, 1) : 0.3;
  const oiNew = row.flags?.exceededOI ? 1 : 0.4;
  const sz = clamp(row.size / 2500, 0, 1);
  const v = p * 0.28 + d * 0.18 + dl * 0.16 + rep * 0.12 + spread * 0.1 + oiNew * 0.08 + sz * 0.08;
  return Math.round(v * 100);
}

function directionOf(row: FlowRow, aggr: string): { bullishPct: number; bearishPct: number; label: string } {
  const base = row.type === "call" ? 1 : row.type === "put" ? -1 : 0;
  const aggMod = aggr === "ask" ? 1 : aggr === "bid" ? -0.7 : 0.35;
  const conviction = 0.4 + 0.6 * clamp(Math.abs(row.delta) / 0.7, 0, 1);
  const s = base * aggMod * conviction; // ~ -1..1
  const bull = Math.round(clamp(50 + s * 42, 8, 92));
  const label = bull >= 65 ? "Alcista" : bull <= 35 ? "Bajista" : "Mixto / sin dirección clara";
  return { bullishPct: bull, bearishPct: 100 - bull, label };
}

export function analyzeInstitutionalFlow(row: FlowRow): InstitutionalRead {
  const aggr = row.aggression ?? "unknown";
  const comps = [
    scorePremium(row.premium),
    scoreSize(row.size),
    scoreDelta(row.delta),
    scoreDte(row.dte),
    scoreOi(!!row.flags?.exceededOI, row.volume, row.openInterest),
    scoreAggr(aggr),
    scoreRepeat(!!row.flags?.repeated),
    scoreLiquidity(row.bid, row.ask, row.price),
  ];
  const flowScore = Math.round(comps.reduce((s, c) => s + c.score, 0));
  const grade = flowScore >= 90 ? "A+" : flowScore >= 82 ? "A" : flowScore >= 72 ? "B" : flowScore >= 58 ? "C" : "D";

  const shares = row.size * 100;
  const notional = shares * (row.assetPrice || 0);
  const mny = moneynessOf(row);
  const dteInfo = dteBucket(row.dte);
  const ba = bidAskRead(aggr, row.type);
  const smc = smartMoney(row);
  const dir = directionOf(row, aggr);
  const newPos = !!row.flags?.exceededOI || (row.openInterest > 0 && row.volume > row.openInterest);
  const expired = row.expiryStatus === "expirado" || row.expiryStatus === "expira_hoy";

  // Recomendación (nunca "compra"): WATCH / HIGH CONVICTION / WAIT / IGNORE.
  let recommendation: InstitutionalRead["recommendation"];
  if (expired || flowScore < 50) recommendation = "IGNORE";
  else if (flowScore >= 88 && row.flags?.repeated && row.premium >= 1e6 && Math.abs(row.delta) >= 0.5) recommendation = "HIGH CONVICTION";
  else if (flowScore >= 70) recommendation = "WATCH";
  else if (flowScore >= 55) recommendation = "WAIT";
  else recommendation = "IGNORE";

  // "Por qué importa": lo positivo que SÍ vemos + lo que falta confirmar (honesto).
  const positives: string[] = [];
  if (row.premium >= 1e6) positives.push(`Premium muy alto (${fmtM(row.premium)})`);
  else if (row.premium >= 1e5) positives.push(`Premium notable (${fmtM(row.premium)})`);
  if (newPos) positives.push("Apertura de nueva posición (volumen > OI)");
  if ((row.dte ?? 0) >= 365) positives.push(`LEAP (${row.dte} DTE) — convicción de largo plazo`);
  else if ((row.dte ?? 0) >= 180) positives.push(`Horizonte institucional (${row.dte} DTE)`);
  if (Math.abs(row.delta) >= 0.5) positives.push(`Delta ${Math.abs(row.delta).toFixed(2)} — direccional serio`);
  if (row.flags?.repeated) positives.push("Órdenes repetidas — posible acumulación institucional");
  if (aggr === "ask") positives.push("Ejecutado al ask — pagó por urgencia");
  positives.push(`Flow Score: ${flowScore}/100`);

  const missing = [
    "Confirmación técnica (ruptura, VWAP, EMAs) — Nagimi no tiene intradía",
    "Fortaleza del SPY/QQQ en vivo",
    "Confirmación en el tape / dark pool",
  ];
  const action =
    recommendation === "HIGH CONVICTION" ? "Señal fuerte, pero espera confirmación técnica antes de abrir. Tú decides y ejecutas."
    : recommendation === "WATCH" ? "Vigílalo. Espera que el precio confirme (ruptura/soporte) antes de estudiar una entrada."
    : recommendation === "WAIT" ? "Interesante pero incompleto. Espera más señales o mejor estructura."
    : "Ignorar: baja calidad o contrato vencido. No aporta a la tesis.";

  const plainLanguage = buildPlain(row, dir, dteInfo.bucket, newPos, notional);

  return {
    flowScore, grade, components: comps,
    premium: { value: row.premium, stars: premiumStars(row.premium) },
    size: { contracts: row.size, shares, notional },
    moneyness: mny,
    delta: { value: row.delta, read: deltaRead(row.delta) },
    dte: { value: row.dte, bucket: dteInfo.bucket, note: dteInfo.note },
    bidAsk: ba,
    oi: { volume: row.volume, openInterest: row.openInterest, newPosition: newPos, read: newPos ? "Posiblemente NUEVA posición (el volumen supera el interés abierto)." : "Probablemente ajuste o cierre de una posición existente." },
    smartMoney: smc,
    direction: dir,
    plainLanguage,
    whyItMatters: { grade, positives, missing, action },
    recommendation,
  };
}

function buildPlain(row: FlowRow, dir: { label: string }, bucket: string, newPos: boolean, notional: number): string {
  const who = row.premium >= 1e6 ? "Un fondo grande" : row.premium >= 1e5 ? "Alguien con capital serio" : "Un trader";
  const dirWord = dir.label === "Alcista" ? "alcista" : dir.label === "Bajista" ? "bajista" : "sin dirección clara";
  const plazo = bucket.includes("LEAP") || bucket.includes("institucional") ? "de largo plazo" : bucket.includes("Swing") ? "de mediano plazo" : "de corto plazo";
  const act = newPos ? "parece estar ABRIENDO" : "parece estar ajustando";
  return `${who} ${act} una posición ${dirWord} ${plazo} en ${row.underlying} (notional ≈ ${fmtM(notional)}). ` +
    `No significa que ${row.underlying} suba o baje mañana — significa que alguien con dinero real cree que el precio se moverá a su favor en ese horizonte. Es una pista para estudiar, no una orden.`;
}
