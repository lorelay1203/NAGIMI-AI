import { describe, expect, it } from "vitest";
import { buildNextSteps, buildSessionNextSteps } from "./nextSteps";
import type { ProPrediction } from "./prediction";
import type { LevelsReport, Level } from "./levels";
import type { GexAnalysis } from "./gex";
import type { DaySession } from "./sessionDay";

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
