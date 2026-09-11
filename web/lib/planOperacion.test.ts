import { describe, expect, it } from "vitest";
import { buildPlan } from "./planOperacion";
import type { ProPrediction, Scenario } from "./prediction";
import type { LevelProb } from "./expectedMove";

const esc = (kind: Scenario["kind"], target: number, changePct: number): Scenario => ({
  kind, target, changePct, probability: 0.5, driver: "",
});
function lvl(strike: number, magnet = 0.5, side: "call" | "put" = "put"): LevelProb {
  return { strike, touch: 0.5, band: 0.3, concentration: 0.4, magnet, side, netGex: 0 };
}
function pred(o: Partial<ProPrediction>): ProPrediction {
  return {
    horizonDays: 20, spot: 100, iv: 0.3,
    bear: esc("bear", 90, -10), base: esc("base", 110, 10), bull: esc("bull", 120, 20),
    score: 60, active: 5, confidence: 60, levels: [], direction: "up",
    summary: "", caveat: null, calibration: { applied: false, shiftPct: 0, samples: 0 },
    ...o,
  };
}

describe("buildPlan", () => {
  it("lateral no da plan (sería adivinar)", () => {
    expect(buildPlan(pred({ direction: "flat" }))).toBeNull();
  });

  it("confianza baja no da plan", () => {
    expect(buildPlan(pred({ direction: "up", confidence: 20 }))).toBeNull();
  });

  it("con aviso de datos no fiables NO da plan (no contradice al veredicto)", () => {
    // Caso real NVDA: veredicto '⚠ no operar' pero antes salía un plan igual.
    const p = buildPlan(pred({
      direction: "up", confidence: 60,
      caveat: "Solo 2 de 6 sub-agentes tienen dato; la confianza está recortada.",
      levels: [lvl(96, 0.9), lvl(92, 0.6)],
    }));
    expect(p).toBeNull();
  });

  it("alcista: entra entre soporte y precio, stop bajo el soporte, objetivo el target", () => {
    const p = buildPlan(pred({
      direction: "up", spot: 100, confidence: 60,
      base: esc("base", 110, 10),
      levels: [lvl(96, 0.9), lvl(92, 0.6), lvl(104, 0.5, "call")],
    }))!;
    expect(p.lado).toBe("alcista");
    expect(p.entradaBaja).toBe(96);   // soporte más cercano
    expect(p.entradaAlta).toBe(100);  // precio
    expect(p.stop).toBe(92);          // segundo soporte
    expect(p.objetivo).toBe(110);     // target base
  });

  it("bajista: entra entre precio y resistencia, stop sobre la resistencia", () => {
    const p = buildPlan(pred({
      direction: "down", spot: 100, confidence: 60,
      base: esc("base", 90, -10),
      levels: [lvl(104, 0.9, "call"), lvl(108, 0.6, "call"), lvl(96, 0.5)],
    }))!;
    expect(p.lado).toBe("bajista");
    expect(p.entradaBaja).toBe(100);  // precio
    expect(p.entradaAlta).toBe(104);  // resistencia más cercana
    expect(p.stop).toBe(108);         // segunda resistencia
    expect(p.objetivo).toBe(90);      // target base
  });

  it("calcula riesgo/recompensa y lo dice en la narración", () => {
    // entrada media = (96+100)/2 = 98; stop 92 → riesgo 6; objetivo 110 → ganancia 12; ratio 2.0
    const p = buildPlan(pred({
      direction: "up", spot: 100, confidence: 60,
      base: esc("base", 110, 10),
      levels: [lvl(96, 0.9), lvl(92, 0.6)],
    }))!;
    expect(p.ratio).toBe(2);
    expect(p.narracion).toContain("ganas 2.0 por cada 1 que arriesgas");
    expect(p.narracion).toContain("Entra entre $96 y $100");
    expect(p.narracion).toContain("Si baja de $92");
    expect(p.narracion).toContain("Si llega a $110");
  });

  it("cuando el riesgo supera la ganancia, lo dice sin adornos", () => {
    // entrada media 98; stop 90 → riesgo 8; objetivo 102 → ganancia 4; ratio 0.5
    const p = buildPlan(pred({
      direction: "up", spot: 100, confidence: 60,
      base: esc("base", 102, 2),
      levels: [lvl(96, 0.9), lvl(90, 0.6)],
    }))!;
    expect(p.ratio).toBe(0.5);
    expect(p.narracion).toContain("arriesgas más de lo que puedes ganar");
  });

  it("sin niveles usa un colchón, no revienta", () => {
    const p = buildPlan(pred({
      direction: "up", spot: 100, confidence: 60, base: esc("base", 110, 10), levels: [],
    }))!;
    expect(p).not.toBeNull();
    expect(p.stop).toBeLessThan(p.entradaBaja);
    expect(p.objetivo).toBe(110);
  });

  it("alcista con target base por debajo del precio: usa el techo o el bull, no un objetivo incoherente", () => {
    // base.target 98 (< spot) no sirve como objetivo alcista → cae al techo 106.
    const p = buildPlan(pred({
      direction: "up", spot: 100, confidence: 60,
      base: esc("base", 98, -2), bull: esc("bull", 115, 15),
      levels: [lvl(96, 0.9), lvl(106, 0.5, "call")],
    }))!;
    expect(p.objetivo).toBeGreaterThan(p.entradaAlta);
  });
});
