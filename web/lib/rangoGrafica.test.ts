import { describe, expect, it } from "vitest";
import {
  RANGOS,
  RANGO_POR_DEFECTO,
  avisoRecorte,
  esRangoId,
  opcionRango,
  recortarRango,
  type RangoId,
} from "./rangoGrafica";

/** Velas de mentira numeradas, para saber cuál quedó al final del recorte. */
function velas(n: number) {
  return Array.from({ length: n }, (_, i) => ({ i, close: 100 + i }));
}

describe("recortarRango", () => {
  it("1 mes sobre un año: se queda con las últimas 21 sesiones", () => {
    const r = recortarRango(velas(252), "1M");
    expect(r.barras).toHaveLength(21);
    expect(r.pedidas).toBe(21);
    expect(r.disponibles).toBe(252);
    expect(r.incompleto).toBe(false);
    // Lo que importa: son las del FINAL, no las del principio.
    expect(r.barras[0].i).toBe(231);
    expect(r.barras[20].i).toBe(251);
  });

  it("6 meses sobre un año: 126 sesiones, terminando en la más reciente", () => {
    const r = recortarRango(velas(252), "6M");
    expect(r.barras).toHaveLength(126);
    expect(r.barras[125].i).toBe(251);
  });

  it("serie más corta que el rango: enseña las que hay y lo marca", () => {
    const r = recortarRango(velas(40), "6M");
    expect(r.barras).toHaveLength(40);
    expect(r.pedidas).toBe(126);
    expect(r.disponibles).toBe(40);
    expect(r.incompleto).toBe(true);
  });

  it("serie vacía: no inventa nada y tampoco avisa de más", () => {
    const r = recortarRango([], "3M");
    expect(r.barras).toEqual([]);
    expect(r.disponibles).toBe(0);
    // Sin velas el panel ya dice "sin histórico"; no hace falta repetirlo.
    expect(r.incompleto).toBe(false);
    expect(avisoRecorte(r)).toBeNull();
  });

  it("un año con 248 velas (feriados) NO se marca incompleto: eso es normal", () => {
    const r = recortarRango(velas(248), "1A");
    expect(r.pedidas).toBe(252);
    expect(r.disponibles).toBe(248);
    expect(r.incompleto).toBe(false);
    expect(avisoRecorte(r)).toBeNull();
  });

  it("un ticker recién salido a bolsa sí se marca incompleto en 1A", () => {
    const r = recortarRango(velas(70), "1A");
    expect(r.incompleto).toBe(true);
    expect(avisoRecorte(r)).toBe("Solo hay 70 sesiones de este ticker: se enseñan todas.");
  });

  it("justo la cantidad pedida: no sobra ni falta, y no se marca incompleto", () => {
    const r = recortarRango(velas(63), "3M");
    expect(r.barras).toHaveLength(63);
    expect(r.incompleto).toBe(false);
  });

  it("no toca el arreglo original", () => {
    const original = velas(300);
    recortarRango(original, "1M");
    expect(original).toHaveLength(300);
  });

  it("rango basura guardado en el navegador: cae en el de por defecto", () => {
    const r = recortarRango(velas(252), "9X" as RangoId);
    expect(r.pedidas).toBe(opcionRango(RANGO_POR_DEFECTO).sesiones);
    expect(r.barras).toHaveLength(126);
  });
});

describe("avisoRecorte", () => {
  it("con el rango completo no dice nada", () => {
    expect(avisoRecorte(recortarRango(velas(252), "1M"))).toBeNull();
  });

  it("con menos velas de las pedidas dice cuántas hay de verdad", () => {
    expect(avisoRecorte(recortarRango(velas(40), "6M"))).toBe(
      "Solo hay 40 sesiones de este ticker: se enseñan todas.",
    );
  });

  it("una sola sesión se dice en singular", () => {
    expect(avisoRecorte(recortarRango(velas(1), "1M"))).toBe(
      "Solo hay 1 sesión de este ticker: es la única que se puede enseñar.",
    );
  });
});

describe("esRangoId", () => {
  it("acepta los cuatro rangos y rechaza cualquier otra cosa", () => {
    for (const r of RANGOS) expect(esRangoId(r.id)).toBe(true);
    expect(esRangoId("2M")).toBe(false);
    expect(esRangoId("")).toBe(false);
    expect(esRangoId(null)).toBe(false);
    expect(esRangoId(6)).toBe(false);
  });
});
