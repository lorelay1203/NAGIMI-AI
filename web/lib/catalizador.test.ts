import { describe, expect, it } from "vitest";
import { buildCatalizador } from "./catalizador";

const HOY = new Date("2026-09-11T14:00:00Z");

describe("buildCatalizador", () => {
  it("sin earnings (ETF/índice) devuelve null", () => {
    expect(buildCatalizador(null, HOY)).toBeNull();
  });

  it("earnings ya pasado devuelve null", () => {
    expect(buildCatalizador({ date: "2026-09-01", hour: "amc", epsEstimate: 2 }, HOY)).toBeNull();
  });

  it("reporte en 3 días → inminente, avisa del IV crush con detalle", () => {
    const c = buildCatalizador({ date: "2026-09-14", hour: "amc", epsEstimate: 2.47 }, HOY)!;
    expect(c.diasFaltan).toBe(3);
    expect(c.nivel).toBe("inminente");
    expect(c.aviso).toContain("IV crush");
    expect(c.aviso).toContain("aunque");
    expect(c.tono).toBe("down");
  });

  it("reporte en 10 días → cerca", () => {
    const c = buildCatalizador({ date: "2026-09-21", hour: "bmo", epsEstimate: null }, HOY)!;
    expect(c.nivel).toBe("cerca");
    expect(c.diasFaltan).toBe(10);
  });

  it("reporte lejano → sin riesgo de IV crush a corto plazo", () => {
    const c = buildCatalizador({ date: "2026-11-17", hour: "amc", epsEstimate: 2.47 }, HOY)!;
    expect(c.nivel).toBe("lejos");
    expect(c.tono).toBe("neutral");
    expect(c.aviso).toContain("lejos");
  });

  it("muestra la hora en llano y el EPS estimado", () => {
    const c = buildCatalizador({ date: "2026-11-17", hour: "amc", epsEstimate: 2.47 }, HOY)!;
    expect(c.viendo).toContain("después del cierre");
    expect(c.viendo).toContain("$2.47");
  });

  it("el día del reporte (0 días) cuenta como inminente, no como pasado", () => {
    const c = buildCatalizador({ date: "2026-09-11", hour: "bmo", epsEstimate: null }, HOY)!;
    expect(c.diasFaltan).toBe(0);
    expect(c.nivel).toBe("inminente");
  });
});
