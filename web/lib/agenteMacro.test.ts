import { describe, expect, it } from "vitest";
import { cambioPct, lecturaMacro } from "./agenteMacro";

/** Serie de 30 cierres que cambia `pct` en las últimas 20 sesiones. */
const serie = (pct: number): number[] => {
  const out = Array(10).fill(100);
  for (let i = 0; i <= 20; i++) out.push(100 * (1 + (pct / 100) * (i / 20)));
  return out;
};

describe("cambioPct", () => {
  it("mide el cambio de las últimas 20 sesiones", () => {
    expect(cambioPct(serie(5))!).toBeCloseTo(5, 1);
    expect(cambioPct(serie(-8))!).toBeCloseTo(-8, 1);
  });
  it("sin sesiones suficientes no inventa", () => {
    expect(cambioPct([100, 101, 102])).toBeNull();
  });
});

describe("lecturaMacro", () => {
  it("mercado arriba y tasas bajando: viento a favor", () => {
    const l = lecturaMacro({ SPY: serie(4), TLT: serie(3), UUP: serie(-2), GLD: serie(1) })!;
    expect(l.senal).toBe("Viento a favor");
    expect(l.tono).toBe("up");
    expect(l.empuje).toContain("a favor de la corriente");
  });

  it("mercado cayendo y dólar fuerte: viento en contra", () => {
    const l = lecturaMacro({ SPY: serie(-5), TLT: serie(-3), UUP: serie(3), GLD: serie(1) })!;
    expect(l.senal).toBe("Viento en contra");
    expect(l.tono).toBe("down");
    expect(l.empuje).toContain("contra la corriente");
  });

  it("todo quieto: ambiente mixto", () => {
    const l = lecturaMacro({ SPY: serie(0.2), TLT: serie(0.1), UUP: serie(0.1), GLD: serie(0) })!;
    expect(l.senal).toBe("Ambiente mixto");
    expect(l.tono).toBe("neutral");
  });

  it("el oro disparado se menciona como nervios", () => {
    const l = lecturaMacro({ SPY: serie(0.2), TLT: serie(0), UUP: serie(0), GLD: serie(9) })!;
    expect(l.empuje).toContain("refugio");
  });

  it("dice los números con su signo y cuántas sesiones mira", () => {
    const l = lecturaMacro({ SPY: serie(4), TLT: serie(-2), UUP: serie(1.5), GLD: serie(0.5) })!;
    expect(l.viendo).toContain("Últimas 20 sesiones");
    expect(l.viendo).toContain("SPY +4.0%");
    expect(l.viendo).toContain("TLT -2.0%");
  });

  it("si falta un proxy sigue funcionando y lo deja en null", () => {
    const l = lecturaMacro({ SPY: serie(3) })!;
    expect(l.cambios.TLT).toBeNull();
    expect(l.viendo).not.toContain("TLT");
  });

  it("sin el mercado (SPY) no se inventa una lectura", () => {
    expect(lecturaMacro({ TLT: serie(2) })).toBeNull();
  });
});
