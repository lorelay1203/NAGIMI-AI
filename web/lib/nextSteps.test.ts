import { describe, expect, it } from "vitest";
import { buildNextSteps, buildSessionNextSteps, buildWheelNextSteps, buildGrandesNextSteps } from "./nextSteps";
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
