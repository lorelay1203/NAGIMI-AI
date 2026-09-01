import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIN_PARAMS, dynamicPinParams, evaluatePin, gatePin, noPinReason, riskReward,
} from "./pinStrategy";

const P = DEFAULT_PIN_PARAMS;

describe("evaluatePin", () => {
  it("en gamma NEGATIVA no hay setup (el mercado acelera, no vuelve)", () => {
    expect(evaluatePin(100, "negative", 90, null, P)).toBeNull();
  });

  it("si el precio está pegado al imán tampoco (no hay recorrido)", () => {
    expect(evaluatePin(100, "positive", 99, null, P)).toBeNull();
  });

  it("precio POR ENCIMA del imán → corto, objetivo el imán", () => {
    const s = evaluatePin(120, "positive", 100, null, P)!;
    expect(s.direction).toBe("short");
    expect(s.target).toBe(100);
    expect(s.stop).toBeGreaterThan(120); // el stop va por arriba
  });

  it("precio POR DEBAJO del imán → largo", () => {
    const s = evaluatePin(80, "positive", 100, null, P)!;
    expect(s.direction).toBe("long");
    expect(s.target).toBe(100);
    expect(s.stop).toBeLessThan(80);
  });

  it("usa el gamma flip como stop cuando cae del lado correcto", () => {
    const s = evaluatePin(120, "positive", 100, 130, P)!;
    expect(s.stop).toBe(130);
  });

  it("ignora el flip si está del lado equivocado y usa el stop fijo", () => {
    const s = evaluatePin(120, "positive", 100, 50, P)!;
    expect(s.stop).toBe(120 + P.fixedStopPts);
  });

  it("el stop nunca queda más pegado que el mínimo", () => {
    // Un flip a 1 punto haría saltar el stop al instante.
    const s = evaluatePin(120, "positive", 100, 121, P)!;
    expect(s.stop - 120).toBeGreaterThanOrEqual(P.minStopPts);
  });

  it("sin imán o sin precio no inventa setup", () => {
    expect(evaluatePin(100, "positive", null, null, P)).toBeNull();
    expect(evaluatePin(0, "positive", 90, null, P)).toBeNull();
  });
});

describe("dynamicPinParams", () => {
  it("escala con el precio: 5 pts no significan lo mismo en SPY que en SPX", () => {
    const spy = dynamicPinParams(760, null, "SPY");
    const nvda = dynamicPinParams(200, null, "NVDA");
    expect(spy.minGapPts).toBeGreaterThan(nvda.minGapPts);
  });

  it("SPX usa umbrales fijos (permite fades cortos de ~10 pts)", () => {
    const spx = dynamicPinParams(7600, null, "SPX");
    expect(spx.minGapPts).toBe(10);
    expect(spx.minRR).toBeLessThan(1);
  });

  it("más volatilidad exige más recorrido", () => {
    const calma = dynamicPinParams(760, 2, "SPY");
    const nervioso = dynamicPinParams(760, 40, "SPY");
    expect(nervioso.minGapPts).toBeGreaterThan(calma.minGapPts);
    expect(nervioso.fixedStopPts).toBeGreaterThan(calma.fixedStopPts);
  });
});

describe("riskReward", () => {
  it("recorrido al objetivo dividido por el del stop", () => {
    expect(riskReward({ direction: "long", entry: 100, target: 110, stop: 95, reason: "" })).toBe(2);
  });
  it("sin riesgo devuelve 0, no infinito", () => {
    expect(riskReward({ direction: "long", entry: 100, target: 110, stop: 100, reason: "" })).toBe(0);
  });
});

describe("gatePin (filtro con lo que hace el mercado)", () => {
  // Corto desde 120 al imán 100, con stop en el flip 135: R:B = 20/15 = 1.33,
  // por encima del mínimo (1.2), así que lo único que puede frenarlo es el flujo.
  const setup = evaluatePin(120, "positive", 100, 135, P)!;

  it("frena si el riesgo/beneficio es bajo", () => {
    const flojo = { direction: "short" as const, entry: 100, target: 99, stop: 110, reason: "" };
    const v = gatePin(flojo, {}, null, P);
    expect(v.status).toBe("wait");
    expect(v.reason).toMatch(/Riesgo\/beneficio bajo/);
  });

  it("frena si el punto de giro está entre el precio y el imán", () => {
    // R:B = 20/10 = 2, así que pasa ese filtro y lo único que frena es el flip.
    const s = { direction: "short" as const, entry: 120, target: 100, stop: 130, reason: "" };
    const v = gatePin(s, {}, 110, P); // flip 110 está entre el precio y el imán
    expect(v.status).toBe("wait");
    expect(v.reason).toMatch(/punto de giro/);
  });

  it("frena si el dinero entra fuerte y rápido en contra", () => {
    const v = gatePin(setup, { velocity: 3, bull: 900, bear: 100 }, 135, P);
    expect(v.status).toBe("wait");
    expect(v.reason).toMatch(/fuerte al alza/);
  });

  it("frena si el flujo domina en contra aunque no sea rápido", () => {
    const v = gatePin(setup, { velocity: 1, bull: 800, bear: 200 }, 135, P);
    expect(v.status).toBe("wait");
    expect(v.reason).toMatch(/manda al alza/);
  });

  it("da luz verde si el flujo acompaña", () => {
    const v = gatePin(setup, { velocity: 1, bull: 100, bear: 900 }, 135, P);
    expect(v.status).toBe("ready");
  });

  it("sin datos de flujo no bloquea (lo que falta no filtra)", () => {
    expect(gatePin(setup, {}, 135, P).status).toBe("ready");
  });
});

describe("noPinReason", () => {
  it("explica el régimen negativo en simple", () => {
    expect(noPinReason(100, "negative", 90, P)).toMatch(/acelera/);
  });
  it("distingue 'pegado al imán' de 'le falta estiramiento'", () => {
    expect(noPinReason(100, "positive", 100, P)).toMatch(/pegado/);
    expect(noPinReason(100, "positive", 96, P)).toMatch(/estiramiento/);
  });
  it("avisa si no hay imán", () => {
    expect(noPinReason(100, "positive", null, P)).toMatch(/imán/);
  });
});
