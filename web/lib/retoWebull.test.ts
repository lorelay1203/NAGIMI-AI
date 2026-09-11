import { describe, expect, it } from "vitest";
import { estadoReto, ESCALERA } from "./retoWebull";

describe("estadoReto", () => {
  it("$10.75 (arranque): peldaño 0, próxima meta $25, no desbloquea opciones", () => {
    const e = estadoReto(10.75);
    expect(e.nivel).toBe(0);
    expect(e.proximaMeta).toBe(25);
    expect(e.falta).toBe(14.25);
    expect(e.desbloqueaOpciones).toBe(false);
    expect(e.progresoPct).toBe(43); // 10.75/25
  });

  it("exactamente en una meta sube al siguiente tramo", () => {
    expect(estadoReto(25).nivel).toBe(1);
    expect(estadoReto(25).proximaMeta).toBe(50);
    expect(estadoReto(50).nivel).toBe(2);
    expect(estadoReto(50).proximaMeta).toBe(100);
  });

  it("a $100 desbloquea opciones y marca el reto como logrado", () => {
    const e = estadoReto(100);
    expect(e.desbloqueaOpciones).toBe(true);
    expect(e.proximaMeta).toBe(Infinity);
    expect(e.falta).toBe(0);
    expect(e.progresoPct).toBe(100);
    expect(e.mensaje).toContain("$100");
  });

  it("más de $100 sigue en el tramo final, sin romperse", () => {
    const e = estadoReto(340);
    expect(e.desbloqueaOpciones).toBe(true);
    expect(e.progresoPct).toBe(100);
    expect(e.peldano.hasta).toBe(Infinity);
  });

  it("saldo 0 o negativo no revienta — queda en el primer peldaño", () => {
    expect(estadoReto(0).nivel).toBe(0);
    expect(estadoReto(-5).nivel).toBe(0);
    expect(estadoReto(NaN).saldo).toBe(0);
  });

  it("cada peldaño trae su explicación de qué se desbloquea", () => {
    expect(estadoReto(15).peldano.desbloquea).toContain("fraccionadas");
    expect(estadoReto(70).peldano.desbloquea).toContain("spread");
    expect(estadoReto(150).peldano.desbloquea).toContain("Venta de Prima");
  });

  it("la escalera está ordenada y sin huecos", () => {
    for (let i = 1; i < ESCALERA.length; i++) {
      expect(ESCALERA[i].desde).toBe(ESCALERA[i - 1].hasta);
    }
  });
});
