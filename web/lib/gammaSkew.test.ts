import { describe, expect, it } from "vitest";
import { gammaSkew, type SkewNode } from "./gammaSkew";

const n = (strike: number, netGex: number): SkewNode => ({ strike, netGex });

describe("gammaSkew", () => {
  it("gamma que acelera cargada abajo → lado engrasado abajo", () => {
    const nodes = [n(95, -800), n(97, -600), n(103, -100), n(105, -50)];
    const s = gammaSkew(nodes, 100, 98);
    expect(s.ladoEngrasado).toBe("abajo");
    expect(s.aceleraAbajo).toBe(1400);
    expect(s.aceleraArriba).toBe(150);
    expect(s.lectura).toContain("ABAJO");
    expect(s.lectura).toContain("corto/bajista, deja");
  });

  it("cargada arriba → lado engrasado arriba", () => {
    const nodes = [n(103, -900), n(106, -500), n(96, -80)];
    const s = gammaSkew(nodes, 100, 102);
    expect(s.ladoEngrasado).toBe("arriba");
    expect(s.lectura).toContain("ARRIBA");
  });

  it("solo cuenta gamma que ACELERA (netGex negativo), ignora la que frena", () => {
    // Todo positivo (frena) → total 0 → sin lado engrasado.
    const nodes = [n(95, 500), n(105, 500)];
    const s = gammaSkew(nodes, 100, null);
    expect(s.aceleraAbajo).toBe(0);
    expect(s.aceleraArriba).toBe(0);
    expect(s.ladoEngrasado).toBe("parejo");
    expect(s.lectura).toContain("no hay gamma que acelere");
  });

  it("repartido parejo (dentro del umbral) → parejo", () => {
    const nodes = [n(96, -500), n(104, -450)]; // ~53% abajo, < 60% umbral
    const s = gammaSkew(nodes, 100, 100);
    expect(s.ladoEngrasado).toBe("parejo");
    expect(s.lectura).toContain("pareja");
  });

  it("distancia al flip en % (negativa si el flip está por debajo)", () => {
    const s = gammaSkew([n(95, -100)], 100, 98);
    expect(s.distFlipPct).toBe(-2); // (98-100)/100
    const s2 = gammaSkew([n(105, -100)], 100, 103);
    expect(s2.distFlipPct).toBe(3);
  });

  it("sin flip devuelve distancia null", () => {
    expect(gammaSkew([n(95, -100)], 100, null).distFlipPct).toBeNull();
  });

  it("ignora strikes en el spot exacto y strikes inválidos", () => {
    const nodes = [n(100, -999), n(0, -999), n(95, -300)];
    const s = gammaSkew(nodes, 100, null);
    expect(s.aceleraAbajo).toBe(300); // solo el 95 cuenta
    expect(s.aceleraArriba).toBe(0);
  });

  it("el sesgo llega a 100 cuando todo está de un lado", () => {
    const s = gammaSkew([n(95, -500), n(93, -500)], 100, null);
    expect(s.sesgoPct).toBe(100);
  });
});
