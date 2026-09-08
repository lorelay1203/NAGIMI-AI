import { describe, expect, it } from "vitest";
import {
  buildNextSteps, buildSessionNextSteps, buildWheelNextSteps, buildGrandesNextSteps,
  buildIdeasNextSteps, buildFlowNextSteps, buildWatchlistNextSteps,
  type SizedIdeaLike,
} from "./nextSteps";
import type { FlowRow, AggressionScore } from "./flow";
import type { WatchlistEntry } from "./watchlist";
import type { ProPrediction } from "./prediction";
import type { LevelsReport, Level } from "./levels";
import type { GexAnalysis } from "./gex";
import type { DaySession } from "./sessionDay";
import type { WheelCandidate } from "./wheel";
import { sortByAffordThenScore } from "./wheelAfford";
import type { Move } from "./bigMoney";

function level(o: Partial<Level>): Level {
  return { price: 95, kind: "soporte", strength: 70, distancePct: -5, sources: {} as never, flipped: false, why: "soporte por pivote", ...o };
}
function levels(o: Partial<LevelsReport>): LevelsReport {
  return { spot: 100, supports: [], resistances: [], keySupport: null, keyResistance: null, tolerancePct: 1, ...o };
}
function prediction(o: Partial<ProPrediction>): ProPrediction {
  return {
    horizonDays: 20, spot: 100, iv: 0.3,
    bear: { kind: "bear", target: 90, changePct: -10, probability: 0.3, driver: "soporte roto" },
    base: { kind: "base", target: 100, changePct: 0, probability: 0.4, driver: "" },
    bull: { kind: "bull", target: 115, changePct: 15, probability: 0.3, driver: "ruptura de resistencia" },
    score: 55, active: 3, confidence: 60, levels: [], direction: "up",
    summary: "", caveat: null, calibration: { applied: false, shiftPct: 0, samples: 0 },
    ...o,
  };
}
function gex(o: Partial<GexAnalysis>): GexAnalysis {
  return { spot: 100, iv: 0.3, nodes: [], kingStrike: 100, flipStrike: 98, regime: "positive", totalNetGex: 1, direction: "flat", confidence: 50, lowLiquidity: false, n: 5, ...o };
}

describe("buildNextSteps", () => {
  it("sin spot válido no devuelve nada (no inventa)", () => {
    expect(buildNextSteps("X", null, null, null)).toEqual([]);
  });

  it("con soporte real, sugiere alerta de precio ahí", () => {
    const l = levels({ spot: 100, keySupport: level({ price: 95 }) });
    const steps = buildNextSteps("NVDA", null, l, null);
    const s = steps.find((x) => x.id === "alerta-soporte")!;
    expect(s.texto).toMatch(/\$95/);
    expect(s.texto).toMatch(/5% abajo/);
  });

  it("con resistencia real, sugiere meta de ganancia", () => {
    const l = levels({ spot: 100, keyResistance: level({ price: 110, kind: "resistencia", why: "techo por pivote" }) });
    const steps = buildNextSteps("NVDA", null, l, null);
    const s = steps.find((x) => x.id === "meta-resistencia")!;
    expect(s.texto).toMatch(/\$110/);
    expect(s.motivo).toBe("techo por pivote");
  });

  it("no sugiere un soporte que está POR ENCIMA del precio (dato inconsistente)", () => {
    const l = levels({ spot: 100, keySupport: level({ price: 105 }) });
    const steps = buildNextSteps("NVDA", null, l, null);
    expect(steps.find((x) => x.id === "alerta-soporte")).toBeUndefined();
  });

  it("usa el escenario alcista/bajista de la predicción con números reales", () => {
    const p = prediction({});
    const steps = buildNextSteps("NVDA", p, null, null);
    expect(steps.find((x) => x.id === "escenario-alcista")!.texto).toMatch(/\$115/);
    expect(steps.find((x) => x.id === "escenario-bajista")!.texto).toMatch(/\$90/);
  });

  it("gamma positiva y negativa dan mensajes distintos", () => {
    const pos = buildNextSteps("X", null, null, gex({ regime: "positive" }));
    const neg = buildNextSteps("X", null, null, gex({ regime: "negative" }));
    expect(pos.find((x) => x.id === "gex-regimen")!.texto).toMatch(/tiende a moverse poco/);
    expect(neg.find((x) => x.id === "gex-regimen")!.texto).toMatch(/acelerarse/);
  });

  it("avisa cuando la confianza es baja", () => {
    const p = prediction({ confidence: 20, active: 2 });
    const steps = buildNextSteps("X", p, null, null);
    expect(steps.find((x) => x.id === "confianza-baja")).toBeDefined();
  });

  it("NO avisa de confianza baja si no hay categorías activas (sin dato, no sin confianza)", () => {
    const p = prediction({ confidence: 20, active: 0 });
    const steps = buildNextSteps("X", p, null, null);
    expect(steps.find((x) => x.id === "confianza-baja")).toBeUndefined();
  });

  it("con confianza alta no avisa", () => {
    const p = prediction({ confidence: 80, active: 5 });
    const steps = buildNextSteps("X", p, null, null);
    expect(steps.find((x) => x.id === "confianza-baja")).toBeUndefined();
  });

  it("junta todo cuando hay datos completos", () => {
    const l = levels({ spot: 100, keySupport: level({ price: 95 }), keyResistance: level({ price: 110, kind: "resistencia" }) });
    const p = prediction({});
    const g = gex({});
    const steps = buildNextSteps("NVDA", p, l, g);
    expect(steps.length).toBeGreaterThanOrEqual(4);
  });
});

function session(o: Partial<DaySession> = {}): DaySession {
  return {
    ticker: "SPY", sessionDate: "2026-09-08", delayed: false, price: 770,
    score: 6, bias: "alcista", regime: "positive", regimeNote: "Gamma positiva: la sesión tiende a RANGO.",
    flow: null, aggression: null, vwapCard: { score: 6, note: "" }, channelCard: { score: 6, note: "" },
    vwap: 768, vwapDelta: 2, openRangeLow: 765, openRangeHigh: 772, openRangeClosed: true,
    dayHigh: 774, dayLow: 764, rangePct: 1.2, atrPct: 0.8, open: 767, prevClose: 766,
    callWall: 775, magnet: 770, putWall: 762, channelPct: 60, callWallDeltaPct: 0.6, putWallDeltaPct: -1.0,
    gexSource: "marketsnack", prints: null,
    ...o,
  };
}

describe("buildSessionNextSteps", () => {
  it("sin precio válido no devuelve nada", () => {
    expect(buildSessionNextSteps(session({ price: 0 }))).toEqual([]);
  });

  it("sugiere alerta en el muro de puts (abajo) y de calls (arriba)", () => {
    const steps = buildSessionNextSteps(session({}));
    expect(steps.find((s) => s.id === "alerta-putwall")!.texto).toMatch(/\$762/);
    expect(steps.find((s) => s.id === "alerta-callwall")!.texto).toMatch(/\$775/);
  });

  it("en gamma positiva sugiere el imán como meta, si no está ya pegado", () => {
    const steps = buildSessionNextSteps(session({ price: 760, magnet: 770, regime: "positive" }));
    expect(steps.find((s) => s.id === "iman-hoy")!.texto).toMatch(/\$770/);
  });

  it("no repite el imán si el precio ya está prácticamente ahí", () => {
    const steps = buildSessionNextSteps(session({ price: 770, magnet: 770.2, regime: "positive" }));
    expect(steps.find((s) => s.id === "iman-hoy")).toBeUndefined();
  });

  it("no sugiere imán en gamma negativa (no aplica el régimen de rango)", () => {
    const steps = buildSessionNextSteps(session({ regime: "negative" }));
    expect(steps.find((s) => s.id === "iman-hoy")).toBeUndefined();
  });

  it("marca el rango de apertura solo si ya cerró", () => {
    const cerrado = buildSessionNextSteps(session({ openRangeClosed: true }));
    const abierto = buildSessionNextSteps(session({ openRangeClosed: false }));
    expect(cerrado.find((s) => s.id === "rango-apertura")).toBeDefined();
    expect(abierto.find((s) => s.id === "rango-apertura")).toBeUndefined();
  });

  it("dice si el precio está arriba o abajo del VWAP", () => {
    const arriba = buildSessionNextSteps(session({ vwap: 768, vwapDelta: 2 }));
    const abajo = buildSessionNextSteps(session({ vwap: 772, vwapDelta: -2 }));
    expect(arriba.find((s) => s.id === "vwap-hoy")!.texto).toMatch(/por encima/);
    expect(abajo.find((s) => s.id === "vwap-hoy")!.texto).toMatch(/por debajo/);
  });

  it("incluye la nota de régimen tal cual la da sessionDay", () => {
    const steps = buildSessionNextSteps(session({ regimeNote: "texto de prueba" }));
    expect(steps.find((s) => s.id === "regimen-hoy")!.texto).toBe("texto de prueba");
  });
});

function wheelCand(o: Partial<WheelCandidate> = {}): WheelCandidate {
  return {
    ticker: "UBER", strike: 74, expiration: "2026-09-11", dte: 7, spot: 75, delta: -0.3,
    theta: -1, iv: 0.4, ivSource: "implicita", openInterest: 500, spreadPct: 5,
    premium: { price: 0.21, source: "bid", raw: 0.21 },
    metrics: { credit: 21, collateral: 79, returnPct: 26.6, annualizedPct: 1387, breakeven: 73.79, cushionPct: 1.6, probExpireWorthless: 81 },
    score: { total: 70, annualized: { points: 20, max: 30, band: "", why: "" }, ivRank: { points: 10, max: 20, band: "", why: "" }, cushion: { points: 15, max: 25, band: "", why: "" }, liquidity: { points: 15, max: 15, band: "", why: "" }, earnings: { points: 10, max: 10, band: "", why: "" } },
    blocked: false, blockReason: null,
    ...o,
  };
}

describe("buildWheelNextSteps", () => {
  it("sin candidatos operables no devuelve nada", () => {
    expect(buildWheelNextSteps([], 100)).toEqual([]);
  });

  it("recomienda el mejor candidato que SÍ cabe, con números reales", () => {
    const rows = sortByAffordThenScore([wheelCand({})], 100);
    const steps = buildWheelNextSteps(rows, 100);
    const s = steps.find((x) => x.id === "wheel-mejor")!;
    expect(s.texto).toMatch(/UBER/);
    expect(s.texto).toMatch(/\$21/);
    expect(s.texto).toMatch(/\$79/);
    expect(s.motivo).toMatch(/81%/);
  });

  it("distingue spread (con protección) de cash-secured puro", () => {
    const rows = sortByAffordThenScore([wheelCand({ longStrike: 73 })], 100);
    const steps = buildWheelNextSteps(rows, 100);
    expect(steps.find((s) => s.id === "wheel-mejor")!.texto).toMatch(/compra el put 73 de protección/);
  });

  it("avisa del punto de equilibrio si te asignan", () => {
    const rows = sortByAffordThenScore([wheelCand({})], 100);
    const steps = buildWheelNextSteps(rows, 100);
    expect(steps.find((s) => s.id === "wheel-breakeven")!.texto).toMatch(/\$73\.79/);
  });

  it("dice cuántos más caben cuando hay variedad", () => {
    const rows = sortByAffordThenScore([wheelCand({ ticker: "UBER" }), wheelCand({ ticker: "NU", strike: 15, metrics: { credit: 10, collateral: 20, returnPct: 5, annualizedPct: 200, breakeven: 14, cushionPct: 1, probExpireWorthless: 85 } })], 100);
    const steps = buildWheelNextSteps(rows, 100);
    expect(steps.find((s) => s.id === "wheel-variedad")!.texto).toMatch(/1 candidato más/);
  });

  it("cuando NADA cabe, dice cuánto falta para el más barato", () => {
    const caro = wheelCand({ ticker: "CARO", metrics: { credit: 50, collateral: 500, returnPct: 10, annualizedPct: 300, breakeven: 490, cushionPct: 2, probExpireWorthless: 70 } });
    const rows = sortByAffordThenScore([caro], 50);
    const steps = buildWheelNextSteps(rows, 50);
    const s = steps.find((x) => x.id === "wheel-sin-alcance")!;
    expect(s.texto).toMatch(/CARO/);
    expect(s.texto).toMatch(/faltarían \$450/);
    expect(steps.find((x) => x.id === "wheel-mejor")).toBeUndefined();
  });

  it("los bloqueados no cuentan como operables", () => {
    const rows = sortByAffordThenScore([wheelCand({ blocked: true, metrics: null })], 100);
    expect(buildWheelNextSteps(rows, 100)).toEqual([]);
  });
});

function move(o: Partial<Move>): Move {
  return { name: "APPLE INC", ticker: "AAPL", kind: "aumento", direction: "alcista", value: 1e9, shares: 100, prevShares: 90, pctOfPortfolio: 5, changePct: 11, ...o };
}

describe("buildGrandesNextSteps", () => {
  it("sin jugadas relevantes, dice que se mantuvo igual", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [move({ kind: "mantiene", changePct: 0 })]);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("grandes-sin-cambios");
  });

  // Caso real encontrado con datos de Buffett: una posición NUEVA trivial
  // ($580K) NO debe ganarle a un aumento de miles de millones solo por ser
  // "nueva" — gana la de mayor valor, sea del tipo que sea.
  it("elige por VALOR, no por tipo: un aumento grande le gana a una nueva chica", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [
      move({ ticker: "DHI", kind: "nueva", value: 580_504, pctOfPortfolio: 0 }),
      move({ ticker: "GOOGL", kind: "aumento", value: 37.8e9, pctOfPortfolio: 12.6, changePct: 83 }),
    ]);
    const s = steps.find((x) => x.id === "grandes-destacada")!;
    expect(s.texto).toMatch(/GOOGL/);
    expect(s.texto).toMatch(/AUMENTÓ/);
  });

  it("una nueva SÍ gana si de verdad es la de mayor valor", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [
      move({ ticker: "AAPL", kind: "aumento", value: 1e9 }),
      move({ ticker: "GOOGL", kind: "nueva", value: 5e9 }),
    ]);
    const s = steps.find((x) => x.id === "grandes-destacada")!;
    expect(s.texto).toMatch(/GOOGL/);
    expect(s.texto).toMatch(/NUEVA/);
  });

  it("sin compra nueva, usa el aumento más grande", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [
      move({ ticker: "AAPL", kind: "aumento", value: 5e9, changePct: 20 }),
      move({ ticker: "MSFT", kind: "aumento", value: 1e9, changePct: 5 }),
    ]);
    expect(steps.find((x) => x.id === "grandes-destacada")!.texto).toMatch(/AAPL/);
  });

  it("agrega una segunda jugada si hay otra distinta", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [
      move({ ticker: "AAPL", kind: "nueva", value: 5e9 }),
      move({ ticker: "MSFT", kind: "aumento", value: 1e9 }),
    ]);
    expect(steps.find((x) => x.id === "grandes-segunda")!.texto).toMatch(/MSFT/);
  });

  it("avisa de salidas completas, hasta 3 nombres", () => {
    const steps = buildGrandesNextSteps("Warren Buffett", [
      move({ ticker: "A", kind: "salida", value: 0 }),
      move({ ticker: "B", kind: "salida", value: 0 }),
    ]);
    const s = steps.find((x) => x.id === "grandes-salidas")!;
    expect(s.texto).toMatch(/A, B/);
    expect(s.texto).toMatch(/vendió TODO/);
  });

  it("con más de 3 salidas, resume el resto", () => {
    const steps = buildGrandesNextSteps("X", [
      move({ ticker: "A", kind: "salida" }), move({ ticker: "B", kind: "salida" }),
      move({ ticker: "C", kind: "salida" }), move({ ticker: "D", kind: "salida" }),
    ]);
    expect(steps.find((x) => x.id === "grandes-salidas")!.texto).toMatch(/y 1 más/);
  });

  it("ignora las jugadas sin ticker (no se puede analizar)", () => {
    const steps = buildGrandesNextSteps("X", [move({ ticker: null, kind: "nueva", value: 999e9 })]);
    expect(steps.find((x) => x.id === "grandes-destacada")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Ideas · Flujo · Watchlist
// ---------------------------------------------------------------------------

function sizedIdea(o: Partial<SizedIdeaLike["idea"]> = {}, s: Partial<SizedIdeaLike["sizing"]> = {}): SizedIdeaLike {
  return {
    idea: {
      ticker: "NVDA", type: "call", strike: 190, expiration: "2026-09-19", dte: 11,
      price: 2.15, thetaPctDaily: null, repeated: false, history: null, ...o,
    },
    sizing: { maxContracts: 2, costPerContract: 215, blocked: null, ...s },
  };
}

describe("buildIdeasNextSteps", () => {
  it("sin ideas no devuelve nada", () => {
    expect(buildIdeasNextSteps([])).toEqual([]);
  });

  it("nombra la mejor idea que SÍ cabe, con su costo real y cuántas caben", () => {
    const steps = buildIdeasNextSteps([sizedIdea()]);
    const s = steps.find((x) => x.id === "ideas-mejor")!;
    expect(s.texto).toContain("NVDA");
    expect(s.texto).toContain("CALL");
    expect(s.texto).toContain("$215");
    expect(s.texto).toContain("hasta 2");
  });

  it("salta las bloqueadas y las de 0 contratos al elegir la mejor", () => {
    const steps = buildIdeasNextSteps([
      sizedIdea({ ticker: "TSLA" }, { blocked: { reason: "iliquido", detail: "" } }),
      sizedIdea({ ticker: "AMD" }, { maxContracts: 0 }),
      sizedIdea({ ticker: "SOFI" }),
    ]);
    expect(steps.find((x) => x.id === "ideas-mejor")!.texto).toContain("SOFI");
  });

  it("usa el historial solo si hay suficientes casos resueltos", () => {
    const pocos = buildIdeasNextSteps([sizedIdea({ history: { hitRate: 60, medianSessions: 4, resolved: 2 } })]);
    expect(pocos.find((x) => x.id === "ideas-historial")).toBeUndefined();

    const bastantes = buildIdeasNextSteps([sizedIdea({ history: { hitRate: 60, medianSessions: 4, resolved: 18 } })]);
    const s = bastantes.find((x) => x.id === "ideas-historial")!;
    expect(s.texto).toContain("60%");
    expect(s.texto).toContain("18 casos");
    expect(s.texto).toContain("4 sesiones");
  });

  it("avisa del theta solo cuando de verdad quema", () => {
    expect(buildIdeasNextSteps([sizedIdea({ thetaPctDaily: 1.2 })]).find((x) => x.id === "ideas-theta")).toBeUndefined();
    const s = buildIdeasNextSteps([sizedIdea({ thetaPctDaily: 5.4 })]).find((x) => x.id === "ideas-theta")!;
    expect(s.texto).toContain("5%");
    expect(s.tipo).toBe("riesgo");
  });

  it("cuando ninguna cabe, dice cuánto cuesta la más barata (no inventa una)", () => {
    const steps = buildIdeasNextSteps([
      sizedIdea({ ticker: "NVDA" }, { maxContracts: 0, costPerContract: 640 }),
      sizedIdea({ ticker: "SOFI" }, { maxContracts: 0, costPerContract: 48 }),
    ]);
    expect(steps.find((x) => x.id === "ideas-mejor")).toBeUndefined();
    const s = steps.find((x) => x.id === "ideas-sin-alcance")!;
    expect(s.texto).toContain("SOFI");
    expect(s.texto).toContain("$48");
  });

  it("cuando nada cabe, explica que el tope es el % del perfil, no el dinero (real: $992 en cuenta, más barata $260)", () => {
    const steps = buildIdeasNextSteps([sizedIdea({ ticker: "RMD" }, { maxContracts: 0, costPerContract: 260 })], 9.92);
    const s = steps.find((x) => x.id === "ideas-sin-alcance")!;
    expect(s.texto).toContain("$260");
    expect(s.motivo).toContain("$9.92");
    expect(s.motivo).toContain("sube el % de riesgo");
  });

  it("sin presupuesto no inventa la explicación del tope", () => {
    const s = buildIdeasNextSteps([sizedIdea({}, { maxContracts: 0 })]).find((x) => x.id === "ideas-sin-alcance")!;
    expect(s.motivo).toBeUndefined();
  });

  it("cuenta las demás que caben, sin contar la destacada dos veces", () => {
    const steps = buildIdeasNextSteps([sizedIdea(), sizedIdea({ ticker: "AMD" }), sizedIdea({ ticker: "SOFI" })]);
    expect(steps.find((x) => x.id === "ideas-variedad")!.texto).toContain("2 ideas más");
  });
});

function flowRow(o: Partial<FlowRow> = {}): FlowRow {
  return {
    id: 1, symbol: "NVDA260919C00190000", underlying: "NVDA", type: "call", strike: 190,
    expiration: "2026-09-19", dte: 11, price: 2.15, size: 100, side: "buy", aggression: "ask",
    assetPrice: 180, bid: 2.1, ask: 2.2, premium: 215_000, delta: 0.4, gamma: 0.01, theta: -0.1,
    vega: 0.2, thetaPctDaily: 4.6, iv: 0.45, openInterest: 5000, volume: 900, score: 7,
    sentiment: "alcista", timestamp: "2026-09-08T14:00:00Z", conditionCode: null, conditionName: null,
    flags: {} as never, scores: {} as never, unusual: true, interesting: true, expiryStatus: "vigente",
    ...o,
  };
}
const scoreOf = (ask: number, bid: number, n = 3): AggressionScore => ({
  score: Math.round((ask / (ask + bid || 1)) * 10),
  ratio: ask / (ask + bid || 1), premiumAsk: ask, premiumBid: bid, premiumMid: 0, n,
});

describe("buildFlowNextSteps", () => {
  it("sin operaciones no devuelve nada", () => {
    expect(buildFlowNextSteps("NVDA", [], scoreOf(0, 0, 0))).toEqual([]);
  });

  it("con dinero mayormente al ask, lo lee como compra agresiva", () => {
    const s = buildFlowNextSteps("NVDA", [flowRow()], scoreOf(800_000, 200_000)).find((x) => x.id === "flow-direccion")!;
    expect(s.texto).toContain("80%");
    expect(s.texto).toContain("compra agresiva");
    expect(s.tipo).toBe("alerta");
  });

  it("con dinero mayormente al bid, lo lee como venta agresiva", () => {
    const s = buildFlowNextSteps("NVDA", [flowRow()], scoreOf(200_000, 800_000)).find((x) => x.id === "flow-direccion")!;
    expect(s.texto).toContain("80%");
    expect(s.texto).toContain("venta agresiva");
    expect(s.tipo).toBe("riesgo");
  });

  it("repartido → dice que no hay lado claro, en vez de forzar una dirección", () => {
    const s = buildFlowNextSteps("NVDA", [flowRow()], scoreOf(500_000, 500_000)).find((x) => x.id === "flow-direccion")!;
    expect(s.texto).toContain("repartido");
  });

  it("reparte el dinero entre calls y puts con cifras reales", () => {
    const rows = [flowRow({ type: "call", premium: 900_000 }), flowRow({ id: 2, type: "put", premium: 300_000 })];
    const s = buildFlowNextSteps("NVDA", rows, scoreOf(1, 1)).find((x) => x.id === "flow-calls-puts")!;
    expect(s.texto).toContain("$900K");
    expect(s.texto).toContain("$300K");
    expect(s.texto).toContain("Pesan más los calls");
  });

  it("destaca la operación de mayor prima, no la primera de la lista", () => {
    const rows = [flowRow({ premium: 50_000, strike: 200 }), flowRow({ id: 2, premium: 4_000_000, strike: 185, size: 2000 })];
    const s = buildFlowNextSteps("NVDA", rows, scoreOf(1, 1)).find((x) => x.id === "flow-mayor")!;
    expect(s.texto).toContain("185");
    expect(s.texto).toContain("$4.0M");
  });

  it("si la agresividad está repartida pero el dinero está casi todo en un tipo, lo reconcilia (caso real NVDA)", () => {
    const rows = [flowRow({ type: "call", premium: 38_800_000 }), flowRow({ id: 2, type: "put", premium: 9_000_000 })];
    const s = buildFlowNextSteps("NVDA", rows, scoreOf(35_567_515, 35_601_416)).find((x) => x.id === "flow-calls-puts")!;
    expect(s.texto).toContain("Pesan más los calls");
    expect(s.motivo).toContain("no contradice");
  });

  it("si la agresividad ya es clara, no añade la aclaración (sobraría)", () => {
    const rows = [flowRow({ type: "call", premium: 38_800_000 }), flowRow({ id: 2, type: "put", premium: 9_000_000 })];
    const s = buildFlowNextSteps("NVDA", rows, scoreOf(900_000, 100_000)).find((x) => x.id === "flow-calls-puts")!;
    expect(s.motivo).toBeUndefined();
  });

  it("avisa de lo ya vencido y de los 0DTE por separado", () => {
    const rows = [
      flowRow({ expiryStatus: "expirado" }),
      flowRow({ id: 2, expiryStatus: "expirado" }),
      flowRow({ id: 3, expiryStatus: "expira_hoy" }),
    ];
    const steps = buildFlowNextSteps("NVDA", rows, scoreOf(1, 1));
    expect(steps.find((x) => x.id === "flow-expirados")!.texto).toContain("2 de estas");
    expect(steps.find((x) => x.id === "flow-0dte")!.texto).toContain("1 son de contratos");
  });
});

function wlEntry(o: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    symbol: "NVDA260919C00190000", ticker: "NVDA", type: "call", strike: 190,
    expiration: "2026-09-19", addedAt: "2026-09-01T14:00:00Z", entrySpot: 180, entryPrice: 2.15,
    entryDte: 18, entryPremium: 215_000, entryThetaPctDaily: null, maxContracts: 2,
    binding: "prima", accountSizeAtEntry: 1000, tolerancePctAtEntry: 1, brokerSync: null,
    ...o,
  };
}
const HOY = new Date("2026-09-08T18:00:00Z");

describe("buildWatchlistNextSteps", () => {
  it("lista vacía no devuelve nada", () => {
    expect(buildWatchlistNextSteps([], HOY)).toEqual([]);
  });

  it("señala los ya vencidos para poder limpiarlos", () => {
    const steps = buildWatchlistNextSteps([wlEntry({ ticker: "AMD", expiration: "2026-08-15" }), wlEntry()], HOY);
    const s = steps.find((x) => x.id === "wl-vencidos")!;
    expect(s.texto).toContain("1 contrato");
    expect(s.texto).toContain("AMD");
  });

  it("el próximo a vencer es el de menos días, no el primero guardado", () => {
    const steps = buildWatchlistNextSteps([
      wlEntry({ ticker: "NVDA", expiration: "2026-12-19" }),
      wlEntry({ ticker: "SOFI", expiration: "2026-09-11", type: "put", strike: 25 }),
    ], HOY);
    const s = steps.find((x) => x.id === "wl-proximo")!;
    expect(s.texto).toContain("SOFI");
    expect(s.texto).toContain("PUT 25");
    expect(s.texto).toContain("en 3 días");
  });

  it("el que vence hoy se dice como HOY, no como 'en 0 días'", () => {
    const s = buildWatchlistNextSteps([wlEntry({ expiration: "2026-09-08" })], HOY).find((x) => x.id === "wl-proximo")!;
    expect(s.texto).toContain("vence HOY");
    expect(s.texto).not.toContain("0 días");
  });

  it("sin fecha de vencimiento no inventa un plazo", () => {
    const steps = buildWatchlistNextSteps([wlEntry({ expiration: null })], HOY);
    expect(steps.find((x) => x.id === "wl-proximo")).toBeUndefined();
    expect(steps.find((x) => x.id === "wl-vencidos")).toBeUndefined();
  });

  it("avisa del que más rápido se derretía, solo si el theta era alto", () => {
    expect(buildWatchlistNextSteps([wlEntry({ entryThetaPctDaily: 1 })], HOY).find((x) => x.id === "wl-theta")).toBeUndefined();
    const s = buildWatchlistNextSteps([
      wlEntry({ ticker: "AMD", entryThetaPctDaily: 3.4 }),
      wlEntry({ ticker: "SOFI", entryThetaPctDaily: 8.2 }),
    ], HOY).find((x) => x.id === "wl-theta")!;
    expect(s.texto).toContain("SOFI");
    expect(s.texto).toContain("8%");
  });
});
