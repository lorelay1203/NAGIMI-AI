import { describe, expect, it } from "vitest";
import { buildNextSteps } from "./nextSteps";
import type { ProPrediction } from "./prediction";
import type { LevelsReport, Level } from "./levels";
import type { GexAnalysis } from "./gex";

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
