// Motor de recomendaciones — puro, para el cliente.
// A partir de la lectura del análisis (dirección, confianza, muros GEX, IV, spot)
// arma ideas de trade de corto y largo plazo, con strikes, vencimiento estimado,
// costo/riesgo por contrato y probabilidad. NO ejecuta nada — es material de estudio.

import { generateLegs, STRATEGIES, type Strategy } from "./orderBuilder";

export type Bias = "up" | "down" | "flat";

export interface RecoInput {
  spot: number;
  iv: number; // 0-1 (fracción)
  direction: Bias | null;
  confidence: number | null; // 0-100
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  caveat?: string | null;
  lowLiquidity?: boolean | null;
  hitRate?: number | null; // % de acierto histórico (memoria) — ajusta el sizing
}

export interface RecoLeg {
  side: "buy" | "sell";
  type: "call" | "put";
  strike: number;
}

export interface TradeIdea {
  plazo: string; // "Corto"/"Largo" o el vencimiento elegido ("0DTE", "1 sem"…)
  estrategia: string;
  bias: Bias;
  legs: RecoLeg[];
  strikesLabel: string;
  dte: number;
  expiry: string; // yyyy-mm-dd
  debit: number; // $ por contrato: >0 pagas (débito), <0 recibes (crédito)
  maxLoss: number; // $ en riesgo por contrato
  maxGain: number | null; // $ por contrato; null = ilimitada
  reason: string;
}

// --- Black-Scholes (para estimar la prima sin llamar a la cadena) ---
function cnd(x: number): number {
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = ((((1.330274429 * k - 1.821255978) * k + 1.781477937) * k - 0.356563782) * k + 0.319381530) * k;
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp((-x * x) / 2) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}
export function bsPrice(type: "call" | "put", S: number, K: number, T: number, iv: number, r = 0.043): number {
  const sig = iv > 0 && iv < 5 ? iv : 0.5;
  if (T <= 0) return Math.max(0, type === "call" ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + (sig * sig) / 2) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);
  return type === "call"
    ? S * cnd(d1) - K * Math.exp(-r * T) * cnd(d2)
    : K * Math.exp(-r * T) * cnd(-d2) - S * cnd(-d1);
}

function strikeStep(spot: number): number {
  if (spot < 25) return 0.5;
  if (spot < 200) return 1;
  return 5;
}
const roundToStep = (x: number, step: number) => Math.round(x / step) * step;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r0 = (x: number) => Math.round(x);

/** Próximo viernes a partir de (now + dte días) — vencimiento típico de opciones. */
function nextFriday(now: Date, dte: number): string {
  const d = new Date(now.getTime() + dte * 86_400_000);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIdeas(inp: RecoInput, now: Date): TradeIdea[] {
  const { spot, iv } = inp;
  if (!(spot > 0)) return [];
  const dir: Bias = inp.direction ?? "flat";
  const step = strikeStep(spot);
  const K = (x: number) => roundToStep(x, step);
  const T = (dte: number) => Math.max(dte, 1) / 365;
  const atm = K(spot);
  const width = Math.max(step, K(spot * 0.03)); // ancho de spread ≈ 3% del spot

  const longOpt = (type: "call" | "put", dte: number): Partial<TradeIdea> => {
    const prem = bsPrice(type, spot, atm, T(dte), iv);
    return {
      legs: [{ side: "buy", type, strike: atm }],
      strikesLabel: `compra ${type === "call" ? "CALL" : "PUT"} $${atm}`,
      debit: r2(prem),
      maxLoss: r0(prem * 100),
      maxGain: null,
    };
  };

  const creditVertical = (type: "call" | "put", dte: number): Partial<TradeIdea> => {
    let sellK: number, buyK: number;
    if (type === "put") { sellK = K(inp.putWall ?? spot - width); buyK = sellK - width; }
    else { sellK = K(inp.callWall ?? spot + width); buyK = sellK + width; }
    const credit = Math.abs(bsPrice(type, spot, sellK, T(dte), iv) - bsPrice(type, spot, buyK, T(dte), iv));
    const w = Math.abs(sellK - buyK);
    return {
      legs: [{ side: "sell", type, strike: sellK }, { side: "buy", type, strike: buyK }],
      strikesLabel: `vende ${type === "put" ? "PUT" : "CALL"} $${sellK} / compra $${buyK}`,
      debit: r2(-credit),
      maxLoss: r0((w - credit) * 100),
      maxGain: r0(credit * 100),
    };
  };

  const ironCondor = (dte: number): Partial<TradeIdea> => {
    const sellC = K(inp.callWall ?? spot + width), buyC = sellC + width;
    const sellP = K(inp.putWall ?? spot - width), buyP = sellP - width;
    const credit =
      (bsPrice("call", spot, sellC, T(dte), iv) - bsPrice("call", spot, buyC, T(dte), iv)) +
      (bsPrice("put", spot, sellP, T(dte), iv) - bsPrice("put", spot, buyP, T(dte), iv));
    const w = Math.max(Math.abs(sellC - buyC), Math.abs(sellP - buyP));
    return {
      legs: [
        { side: "sell", type: "put", strike: sellP }, { side: "buy", type: "put", strike: buyP },
        { side: "sell", type: "call", strike: sellC }, { side: "buy", type: "call", strike: buyC },
      ],
      strikesLabel: `condor: PUT $${sellP}/$${buyP} · CALL $${sellC}/$${buyC}`,
      debit: r2(-credit),
      maxLoss: r0((w - credit) * 100),
      maxGain: r0(credit * 100),
    };
  };

  const mk = (base: Partial<TradeIdea>, extra: Pick<TradeIdea, "plazo" | "estrategia" | "bias" | "dte" | "reason">): TradeIdea =>
    ({ ...base, ...extra, expiry: nextFriday(now, extra.dte) } as TradeIdea);

  const ideas: TradeIdea[] = [];

  if (dir === "up" || dir === "down") {
    const t: "call" | "put" = dir === "up" ? "call" : "put";
    const label = t === "call" ? "Call largo" : "Put largo";
    ideas.push(mk(longOpt(t, 7), { plazo: "Corto", estrategia: label, bias: dir, dte: 7, reason: "Direccional simple alineado con el flujo. Ganancia abierta, riesgo = prima." }));
    ideas.push(mk(longOpt(t, 45), { plazo: "Largo", estrategia: label, bias: dir, dte: 45, reason: "Misma dirección con más tiempo: menos desgaste diario (theta), aguanta más." }));
    const cv: "call" | "put" = dir === "up" ? "put" : "call";
    ideas.push(mk(creditVertical(cv, 14), { plazo: "Corto", estrategia: `${cv === "put" ? "Put" : "Call"} credit spread`, bias: dir, dte: 14, reason: "Riesgo definido: cobras prima a favor de la dirección; ganas si no va en contra." }));
  } else {
    ideas.push(mk(ironCondor(14), { plazo: "Corto", estrategia: "Iron Condor", bias: "flat", dte: 14, reason: "Sin dirección clara: cobras prima si el precio se queda en el rango entre muros." }));
    ideas.push(mk(ironCondor(35), { plazo: "Largo", estrategia: "Iron Condor", bias: "flat", dte: 35, reason: "Mismo rango, más plazo: más prima pero más exposición a que rompa." }));
  }

  return ideas;
}

export const STRATEGY_OPTIONS = STRATEGIES;

/** Arma la idea para una ESTRATEGIA elegida por la usuaria (single, verticales, venta de
 *  prima, butterfly, condor, iron condor), la valora con Black-Scholes y calcula su payoff. */
export function buildStrategyIdea(
  strategy: Strategy,
  inp: RecoInput,
  plazo: string,
  now: Date,
  dteOverride?: number,
): TradeIdea | null {
  const { spot, iv } = inp;
  if (!(spot > 0)) return null;
  const dir: Bias = inp.direction ?? "flat";
  const step = strikeStep(spot);
  const K = (x: number) => roundToStep(x, step);
  const dte = dteOverride != null ? dteOverride : plazo === "Corto" ? 7 : 40;
  // Vencimientos cortos (0-5 DTE) quieren strikes más pegados; largos, más anchos.
  const width = Math.max(step, K(spot * (dte <= 5 ? 0.012 : 0.03)));
  const T = Math.max(dte, 0.7) / 365; // 0DTE ≈ 0.7 día para no dividir por cero
  const neutral = strategy === "butterfly" || strategy === "condor" || strategy === "iron_condor";
  const type: "call" | "put" = neutral
    ? "call"
    : strategy === "credit"
    ? (dir === "down" ? "call" : "put") // put credit = alcista; call credit = bajista
    : (dir === "down" ? "put" : "call");
  const center =
    strategy === "credit" ? K(type === "put" ? (inp.putWall ?? spot) : (inp.callWall ?? spot))
    : neutral ? K(inp.magnet ?? spot)
    : K(spot);

  const legs = generateLegs(strategy, type, center, width);
  const priced = legs.map((l) => ({ ...l, price: bsPrice(l.optionType, spot, l.strike, T, iv) }));
  const debit = priced.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * l.price * 100 * l.quantity, 0);
  const plAt = (S: number) => priced.reduce((s, l) => {
    const intr = l.optionType === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    return s + (l.side === "buy" ? 1 : -1) * (intr - l.price) * 100 * l.quantity;
  }, 0);
  const lo = Math.max(0.01, spot * 0.55), hi = spot * 1.45;
  let maxG = -Infinity, maxL = Infinity;
  for (let i = 0; i <= 240; i++) { const v = plAt(lo + ((hi - lo) * i) / 240); if (v > maxG) maxG = v; if (v < maxL) maxL = v; }
  const unbounded = strategy === "single";

  const bias: Bias = neutral ? "flat" : strategy === "credit" ? (type === "put" ? "up" : "down") : (type === "call" ? "up" : "down");
  const credit = debit < 0;
  const reason = credit
    ? "Venta de prima: cobras el crédito por adelantado; ganas si el precio se queda en tu zona (theta a favor)."
    : neutral
    ? "Riesgo definido en un rango alrededor del imán; ganas si el precio no se aleja."
    : "Direccional con riesgo definido según los strikes elegidos.";
  const label = STRATEGIES.find((s) => s.id === strategy)?.label ?? strategy;

  return {
    plazo, estrategia: label, bias,
    legs: priced.map((l) => ({ side: l.side, type: l.optionType, strike: l.strike })),
    strikesLabel: priced.map((l) => `${l.side === "buy" ? "+" : "−"}${l.quantity > 1 ? l.quantity : ""}${l.optionType === "call" ? "C" : "P"}$${l.strike}`).join(" / "),
    dte, expiry: dte === 0 ? now.toISOString().slice(0, 10) : nextFriday(now, dte),
    debit: r2(debit),
    maxLoss: r0(Math.max(0, -maxL)),
    maxGain: unbounded ? null : r0(Math.max(0, maxG)),
    reason,
  };
}

// --- Señal + dimensionamiento por broker ---
export interface Broker { name: string; cash: number }

export interface RiskGate { name: string; ok: boolean; note: string }

export interface SizedReco extends TradeIdea {
  broker: string | null; // broker que cubre ≥1 contrato (el más ajustado)
  contracts: number; // contratos que caben en ese broker
  riskOne: number; // riesgo de 1 contrato ($)
  pctOfBroker: number | null; // riesgo 1 contrato como % de ese broker
  sizePct: number | null; // riesgo 1 contrato como % del capital TOTAL (regla 1-2%)
  maxRiskPct: number; // % máximo a arriesgar SEGÚN la fiabilidad del trade (0.5–2%)
  suggestedContracts: number; // contratos sugeridos: caben en ese % Y en tu broker
  suggestedRisk: number; // $ que arriesgarías con el tamaño sugerido
  gates: RiskGate[]; // Risk Gate (Playbook 3): guardrails antes de proponer
  signal: "Entrar" | "Esperar" | "Evitar";
  note: string;
}

/** % máximo a arriesgar según qué tan FIABLE es el trade (regla starter 1-2%, escalada).
 *  Más confianza + mejor historial → más %; datos dudosos → mínimo. */
export function reliabilityRiskPct(input: RecoInput): number {
  const conf = input.confidence ?? 0;
  let pct = conf >= 75 ? 2 : conf >= 60 ? 1.5 : conf >= 45 ? 1 : conf >= 30 ? 0.75 : 0.5;
  if (input.hitRate != null && input.hitRate < 50) pct = Math.min(pct, 1); // historial flojo → recorta
  if (input.hitRate != null && input.hitRate >= 65) pct = Math.min(2, pct + 0.25); // buen historial → sube un poco
  if (input.caveat || input.lowLiquidity) pct = 0.5; // datos dudosos → lo mínimo
  return Math.round(pct * 100) / 100;
}

export function sizeReco(idea: TradeIdea, brokers: Broker[], input: RecoInput): SizedReco {
  const riskOne = Math.max(idea.maxLoss, idea.debit > 0 ? idea.debit * 100 : 0);
  // Broker más ajustado que cubra ≥1 contrato (usa el capital justo, no el más grande).
  const affordable = brokers
    .filter((b) => b.cash > 0 && b.cash >= riskOne)
    .sort((a, b) => a.cash - b.cash);
  const chosen = affordable[0] ?? null;
  const contracts = chosen ? Math.floor(chosen.cash / riskOne) : 0;
  const pctOfBroker = chosen ? (riskOne / chosen.cash) * 100 : null;

  const conf = input.confidence ?? 0;
  const aligned = idea.bias === (input.direction ?? "flat");
  const totalCap = brokers.reduce((s, b) => s + (b.cash > 0 ? b.cash : 0), 0);
  const sizePct = totalCap > 0 ? (riskOne / totalCap) * 100 : null;
  const maxRiskPct = reliabilityRiskPct(input);
  const suggestedRisk = totalCap > 0 ? Math.round((totalCap * maxRiskPct) / 100) : 0;
  const suggestedContracts = Math.max(0, Math.min(riskOne > 0 ? Math.floor(suggestedRisk / riskOne) : 0, contracts));

  // --- Risk Gate (Playbook 3 · guardrails). El trade solo "pasa" si todo está en verde. ---
  const gates: RiskGate[] = [
    { name: "Perfil", ok: aligned, note: aligned ? "alineado con la lectura de los agentes" : "va contra la dirección leída" },
    { name: "Tamaño ≤2%", ok: sizePct != null && sizePct <= 2, note: sizePct != null ? `riesga ${sizePct.toFixed(1)}% de tu capital (regla starter 1-2%)` : "captura tu capital por broker" },
    { name: "Riesgo definido", ok: true, note: idea.maxGain != null ? "pérdida y ganancia acotadas" : "pérdida acotada = la prima" },
    { name: "Cabe en broker", ok: !!chosen, note: chosen ? `${chosen.name} lo cubre (${contracts}x)` : `ningún broker cubre 1 contrato (~$${riskOne.toLocaleString("en-US")})` },
    { name: "Datos fiables", ok: !input.caveat && !input.lowLiquidity, note: input.caveat || input.lowLiquidity ? "datos poco fiables — no operar" : "datos ok" },
  ];
  const passed = gates.every((g) => g.ok);

  let signal: SizedReco["signal"];
  let note: string;
  if (!aligned) {
    signal = "Evitar";
    note = "Red flag: va contra la dirección de los agentes.";
  } else if (input.caveat || input.lowLiquidity) {
    signal = "Esperar";
    note = "Red flag: datos poco fiables — espera confirmación.";
  } else if (!chosen) {
    signal = "Esperar";
    note = "Falta capital: ningún broker cubre 1 contrato.";
  } else if (sizePct != null && sizePct > 2) {
    signal = "Esperar";
    note = `Excede el 2% del capital (${sizePct.toFixed(1)}%). Reduce tamaño o espera más capital.`;
  } else if (passed && conf >= 55) {
    signal = "Entrar";
    note = `✓ Pasa el Risk Gate · confianza ${Math.round(conf)}%. Falta TU aprobación (la app no ejecuta).`;
  } else if (conf >= 35) {
    signal = "Esperar";
    note = `Gates ok pero confianza baja (${Math.round(conf)}%). Media posición o espera.`;
  } else {
    signal = "Esperar";
    note = `Confianza muy baja (${Math.round(conf)}%). Sin señal clara.`;
  }

  return { ...idea, broker: chosen?.name ?? null, contracts, riskOne, pctOfBroker, sizePct, maxRiskPct, suggestedContracts, suggestedRisk, gates, signal, note };
}
