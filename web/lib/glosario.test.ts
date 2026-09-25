import { describe, it, expect } from "vitest";
import { glosario, definir, enSimple } from "./glosario";

describe("glosario", () => {
  it("encuentra una palabra sin importar mayúsculas ni espacios", () => {
    expect(definir("  vWaP ")?.simple).toBe("Precio promedio del día");
  });

  it("devuelve null si la palabra no está", () => {
    expect(definir("chupacabra")).toBeNull();
  });

  it("enSimple devuelve la palabra tal cual si no la conoce", () => {
    expect(enSimple("chupacabra")).toBe("chupacabra");
  });

  it("no repite términos", () => {
    const claves = glosario().map((e) => e.termino.toLowerCase());
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("toda entrada tiene nombre simple y explicación de verdad", () => {
    for (const e of glosario()) {
      expect(e.simple.length).toBeGreaterThan(2);
      expect(e.explica.length).toBeGreaterThan(20);
    }
  });

  it("la explicación no se apoya en otra sigla sin traducir", () => {
    // Si una explicación usa una sigla, esa sigla tiene que estar también en el
    // glosario — si no, se estaría explicando una palabra rara con otra.
    const siglas = new Set(glosario().map((e) => e.termino.toUpperCase()));
    for (const e of glosario()) {
      for (const m of e.explica.match(/\b[A-Z]{2,5}\b/g) ?? []) {
        expect(siglas.has(m), `${m} sale en la explicación de ${e.termino} sin estar en el glosario`).toBe(true);
      }
    }
  });
});
