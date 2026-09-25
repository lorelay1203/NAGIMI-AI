import { describe, expect, it } from "vitest";
import { DEFAULT_PIN_PARAMS, evaluateEmpujon, riskReward } from "./pinStrategy";

// P: minGapPts 5, fixedStopPts 15, minStopPts 8, minRR 1.2
const P = DEFAULT_PIN_PARAMS;
const LV = { callWall: 7760, putWall: 7650, gammaFlip: 7690 };

describe("evaluateEmpujon (día de empujón)", () => {
  it("en día de rango no aplica", () => {
    const r = evaluateEmpujon(7700, "positive", LV, { bull: 80, bear: 20 }, 30, P);
    expect(r.setup).toBeNull();
  });

  it("sin flujo no adivina la dirección", () => {
    const r = evaluateEmpujon(7700, "negative", LV, {}, 30, P);
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/no se pudo leer/);
  });

  it("con el dinero repartido espera", () => {
    const r = evaluateEmpujon(7700, "negative", LV, { bull: 52, bear: 48 }, 30, P);
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/repartido/);
  });

  it("dinero alcista + precio encima del punto de cambio → compra hacia el techo", () => {
    const r = evaluateEmpujon(7700, "negative", LV, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup).not.toBeNull();
    const s = r.setup!;
    expect(s.direction).toBe("long");
    expect(s.target).toBe(7760);
    // stop: el flip (7690) queda a 10 pts, más que el mínimo de 8 → se usa el flip
    expect(s.stop).toBe(7690);
    expect(riskReward(s)).toBeCloseTo(6, 5);
  });

  it("dinero alcista pero precio debajo del punto de cambio → espera", () => {
    const r = evaluateEmpujon(7680, "negative", LV, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/chocan/);
  });

  it("dinero bajista + precio debajo del punto de cambio → hacia el suelo", () => {
    const r = evaluateEmpujon(7680, "negative", LV, { bull: 25, bear: 75 }, 30, P);
    expect(r.setup?.direction).toBe("short");
    expect(r.setup?.target).toBe(7650);
    expect(r.setup?.stop).toBe(7690);
  });

  it("sin muro por delante, el objetivo es 1σ", () => {
    const r = evaluateEmpujon(7770, "negative", LV, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup?.target).toBe(7800);
  });

  it("el stop nunca queda más lejos de 1,5 veces el stop fijo", () => {
    // flip muy lejos (7600): el stop se recorta a 7700 − 22,5
    const r = evaluateEmpujon(7700, "negative", { ...LV, gammaFlip: 7600 }, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup?.stop).toBeCloseTo(7677.5, 5);
  });

  it("si el muro está pegado, no hay recorrido", () => {
    const r = evaluateEmpujon(7757, "negative", LV, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/poco recorrido/);
  });

  it("si lo que se gana no compensa lo que se arriesga, espera", () => {
    // techo a 12 pts, stop en el flip a 10 pts → 1,2:1 justo pasa; con flip a 12 no
    const r = evaluateEmpujon(7748, "negative", { ...LV, gammaFlip: 7736 }, { bull: 70, bear: 30 }, 30, P);
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/no compensa/);
  });
});
