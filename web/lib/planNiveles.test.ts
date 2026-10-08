import { describe, expect, it } from "vitest";
import { filasNivel, planPorNiveles, type FilaNivel } from "./planNiveles";
import type { NivelConfirmado } from "./nivelesConfirmados";

function nivel(o: Partial<NivelConfirmado>): NivelConfirmado {
  return {
    strike: 780, lado: "techo", vencimientos: ["2026-10-08"], dtes: [1], veces: 1, gex: 1,
    distanciaPct: 0.4, etiqueta: "1d", probTocar: 0.5, lectura: "x", ...o,
  };
}

describe("filasNivel", () => {
  it("techo y suelo del mismo precio → una zona de pelea", () => {
    const f = filasNivel([nivel({ lado: "techo", veces: 3 }), nivel({ lado: "suelo", veces: 1 })]);
    expect(f).toHaveLength(1);
    expect(f[0].clase).toBe("pelea");
    expect(f[0].etiqueta).toBe("techo en 3 · suelo en 1");
  });
  it("un techo debajo del precio está cruzado", () => {
    expect(filasNivel([nivel({ strike: 775, distanciaPct: -0.3 })])[0].clase).toBe("techo-roto");
  });
  it("un suelo encima del precio está cruzado", () => {
    expect(filasNivel([nivel({ lado: "suelo", strike: 779, distanciaPct: 0.2 })])[0].clase).toBe("suelo-roto");
  });
});

function fila(strike: number, clase: FilaNivel["clase"], veces = 1): FilaNivel {
  return { strike, clase, distanciaPct: 0, veces, etiqueta: "", vencimientos: [], probTocar: null, lectura: "" };
}

// SPY real del 7-oct: precio 777.22; techos 780 (pelea, 4 venc.), 785, 790; suelos 770, 767.
const FILAS = [fila(790, "techo"), fila(785, "techo"), fila(780, "pelea", 4), fila(779, "suelo-roto", 2), fila(770, "suelo"), fila(767, "suelo")];
const BASE = { ticker: "SPY", spot: 777.22, regimen: "positive" as const, flujoAlcista: 0.5, filas: FILAS, paso: 1 };

describe("planPorNiveles", () => {
  it("día de rango: plan para el techo, el suelo y el rango", () => {
    const p = planPorNiveles(BASE);
    expect(p.map((x) => x.precio)).toEqual([780, 770, 777.22]);
  });

  it("techo en día de rango → call credit spread por encima del techo", () => {
    const j = planPorNiveles(BASE)[0].jugadas[0];
    expect(j.estrategia).toMatch(/^Call credit spread/);
    expect(j.patas).toBe("vender call $781 · comprar call $782");
    expect(j.si).toContain("Si SPY llega a $780");
    expect(j.confianza).toBe("alta"); // rango + se repite en 4 + dinero no está comprando
  });

  it("ruptura del techo apunta al próximo techo", () => {
    const j = planPorNiveles(BASE)[0].jugadas[1];
    expect(j.estrategia).toMatch(/^Call debit spread/);
    expect(j.patas).toBe("comprar call $780 · vender call $785");
    expect(j.meta).toContain("$785");
    expect(j.confianza).toBe("baja"); // en día de rango las rupturas fallan
  });

  it("los muros cruzados no se usan para planes", () => {
    const p = planPorNiveles(BASE);
    expect(p.some((x) => x.precio === 779)).toBe(false);
  });

  it("suelo en día de rango → put credit spread por debajo", () => {
    const j = planPorNiveles(BASE)[1].jugadas[0];
    expect(j.patas).toBe("vender put $769 · comprar put $768");
    const perder = planPorNiveles(BASE)[1].jugadas[1];
    expect(perder.patas).toBe("comprar put $770 · vender put $767");
  });

  it("rango → iron condor entre los dos muros", () => {
    const j = planPorNiveles(BASE)[2].jugadas[0];
    expect(j.estrategia).toMatch(/^Iron condor/);
    expect(j.confianza).toBe("alta"); // rango + dinero repartido
  });

  it("día de empujón con dinero comprando: la ruptura del techo es la jugada fuerte y no hay iron condor", () => {
    const p = planPorNiveles({ ...BASE, regimen: "negative", flujoAlcista: 0.7 });
    expect(p[0].jugadas[1].confianza).toBe("alta");
    expect(p[0].jugadas[0].estrategia).toMatch(/^Put debit spread/);
    expect(p.some((x) => x.jugadas[0].estrategia.startsWith("Iron condor"))).toBe(false);
  });

  it("en SPX los strikes van de 5 en 5", () => {
    const p = planPorNiveles({ ...BASE, ticker: "SPX", spot: 7791, paso: 5, filas: [fila(7800, "techo", 3), fila(7750, "suelo", 2)] });
    expect(p[0].jugadas[0].patas).toBe("vender call $7,805 · comprar call $7,810");
  });

  it("sin precio o sin paso no inventa", () => {
    expect(planPorNiveles({ ...BASE, spot: 0 })).toEqual([]);
    expect(planPorNiveles({ ...BASE, paso: 0 })).toEqual([]);
  });
});
