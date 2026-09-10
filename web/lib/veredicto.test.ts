import { describe, expect, it } from "vitest";
import { escenarioOpuesto, rielAVigilar } from "./veredicto";
import type { LevelProb } from "./expectedMove";
import type { Scenario } from "./prediction";

const esc = (kind: Scenario["kind"], target: number, changePct: number): Scenario => ({
  kind, target, changePct, probability: 0.5, driver: "",
});

function lvl(o: Partial<LevelProb> & { strike: number; magnet: number }): LevelProb {
  return { touch: 0.5, band: 0.3, concentration: 0.4, side: "call", netGex: 0, ...o };
}

describe("escenarioOpuesto", () => {
  it("alcista → el riesgo es el escenario bajista", () => {
    const r = escenarioOpuesto({ direction: "up", bear: esc("bear", 90, -10), bull: esc("bull", 115, 15) });
    expect(r.kind).toBe("bear");
  });
  it("bajista → el riesgo es el escenario alcista", () => {
    const r = escenarioOpuesto({ direction: "down", bear: esc("bear", 90, -10), bull: esc("bull", 115, 15) });
    expect(r.kind).toBe("bull");
  });
  it("lateral → el que más se mueve (el que más asustaría)", () => {
    const r = escenarioOpuesto({ direction: "flat", bear: esc("bear", 70, -30), bull: esc("bull", 110, 10) });
    expect(r.kind).toBe("bear"); // -30% asusta más que +10%
  });
});

describe("rielAVigilar", () => {
  it("sin niveles no inventa nada", () => {
    expect(rielAVigilar([], 100, "up", 105)).toBeNull();
  });

  it("alcista: elige el PISO más fuerte por debajo del precio, no el target", () => {
    // Caso real NVDA: spot 218, target 225, imán más fuerte también en 225.
    // Debe ignorar el 225 (repetiría "a favor") y mostrar el piso en 200.
    const levels = [
      lvl({ strike: 225, magnet: 0.9, side: "call" }), // el más fuerte, = target
      lvl({ strike: 200, magnet: 0.6, side: "call" }), // piso
      lvl({ strike: 210, magnet: 0.3, side: "put" }),
    ];
    const r = rielAVigilar(levels, 218.36, "up", 225);
    expect(r).not.toBeNull();
    expect(r!.strike).toBe(200);
    expect(r!.esPiso).toBe(true);
  });

  it("bajista: elige el TECHO más fuerte por encima del precio", () => {
    const levels = [
      lvl({ strike: 95, magnet: 0.9 }),   // el más fuerte, abajo
      lvl({ strike: 110, magnet: 0.7 }),  // techo (arriba)
      lvl({ strike: 105, magnet: 0.5 }),  // techo más cercano pero menos fuerte
    ];
    const r = rielAVigilar(levels, 100, "down", 92);
    expect(r!.strike).toBe(110);
    expect(r!.esPiso).toBe(false);
  });

  it("lateral: cualquier imán fuerte que no sea casi el target", () => {
    const levels = [
      lvl({ strike: 100.2, magnet: 0.9 }), // ~igual al target 100 → se descarta
      lvl({ strike: 108, magnet: 0.6 }),
    ];
    const r = rielAVigilar(levels, 100, "flat", 100);
    expect(r!.strike).toBe(108);
  });

  it("si no hay nivel en el lado preferido, cae al imán fuerte que no sea el target", () => {
    // Alcista pero TODOS los niveles están por encima del precio (no hay piso).
    const levels = [
      lvl({ strike: 130, magnet: 0.9 }), // = target, se descarta
      lvl({ strike: 140, magnet: 0.5 }), // arriba, no es piso pero sirve
    ];
    const r = rielAVigilar(levels, 120, "up", 130);
    expect(r!.strike).toBe(140);
    expect(r!.esPiso).toBe(false); // está arriba del precio
  });

  it("descarta el nivel que es prácticamente el target (dentro de 0.5%)", () => {
    const levels = [lvl({ strike: 225.5, magnet: 0.9 })]; // 225.5 vs target 225 = 0.2%
    // Es el único nivel y es ~el target → no hay otro riel que mostrar.
    expect(rielAVigilar(levels, 218, "up", 225)).toBeNull();
  });
});
