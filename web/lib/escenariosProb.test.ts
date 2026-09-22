import { describe, expect, it } from "vitest";
import { porQueEscenario, repartoEscenarios } from "./escenariosProb";

describe("repartoEscenarios", () => {
  const base = { spot: 228, iv: 0.45, dias: 20, bear: 216, base: 226, bull: 238 };

  it("los tres suman exactamente 100", () => {
    const r = repartoEscenarios(base)!;
    expect(r.bajista + r.neutral + r.alcista).toBe(100);
  });

  it("corta a la mitad entre escenarios", () => {
    const r = repartoEscenarios(base)!;
    expect(r.corteBajo).toBe(221);
    expect(r.corteAlto).toBe(232);
  });

  it("con poca volatilidad casi todo el peso va al centro", () => {
    const r = repartoEscenarios({ ...base, iv: 0.05 })!;
    expect(r.neutral).toBeGreaterThan(90);
  });

  it("con mucha volatilidad el peso se reparte a los lados", () => {
    const r = repartoEscenarios({ ...base, iv: 1.2 })!;
    expect(r.neutral).toBeLessThan(40);
    expect(r.bajista).toBeGreaterThan(10);
    expect(r.alcista).toBeGreaterThan(10);
  });

  it("si el precio ya está pegado al objetivo alcista, ese lado pesa más", () => {
    const r = repartoEscenarios({ ...base, spot: 237 })!;
    expect(r.alcista).toBeGreaterThan(r.bajista);
  });

  it("no inventa cuando los datos no dan", () => {
    expect(repartoEscenarios({ ...base, spot: 0 })).toBeNull();
    expect(repartoEscenarios({ ...base, dias: 0 })).toBeNull();
    // Escenarios desordenados (base fuera del medio): no hay reparto posible.
    expect(repartoEscenarios({ ...base, base: 250 })).toBeNull();
  });

  it("siempre suma 100 aunque el redondeo quede feo", () => {
    for (const iv of [0.11, 0.23, 0.37, 0.52, 0.78, 0.99]) {
      for (const dias of [5, 10, 20, 30, 45]) {
        const r = repartoEscenarios({ ...base, iv, dias })!;
        expect(r.bajista + r.neutral + r.alcista).toBe(100);
      }
    }
  });
});

describe("porQueEscenario", () => {
  it("en gamma positiva el neutral habla del imán", () => {
    expect(porQueEscenario("neutral", "positive", true)).toContain("imán");
  });

  it("en gamma negativa los extremos hablan de que acelera", () => {
    expect(porQueEscenario("alcista", "negative", false)).toContain("acelera");
    expect(porQueEscenario("bajista", "negative", false)).toContain("acelera");
  });

  it("marca cuál es el de más peso cuando lo es", () => {
    expect(porQueEscenario("alcista", "positive", true)).toContain("más peso");
    expect(porQueEscenario("alcista", "positive", false)).not.toContain("más peso");
  });
});
