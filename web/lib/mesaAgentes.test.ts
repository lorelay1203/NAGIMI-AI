import { describe, expect, it } from "vitest";
import { describeAgente, describeMesa, type ParteAgente } from "./mesaAgentes";

const p = (name: string, score: number | null, note = "nota", weight = 20): ParteAgente => ({ name, score, note, weight });

describe("describeAgente", () => {
  it("le pone código y 'qué hace' a un agente conocido", () => {
    const a = describeAgente(p("Agresividad", 7));
    expect(a.codigo).toBe("AGR");
    expect(a.queHace).toContain("ask");
    expect(a.nombre).toBe("Agresividad");
  });

  it("score alto → Alcista, empuja arriba", () => {
    const a = describeAgente(p("Convicción", 8));
    expect(a.senal).toBe("Alcista");
    expect(a.tono).toBe("up");
    expect(a.empuje).toContain("arriba");
  });

  it("score bajo → Bajista, frena abajo", () => {
    const a = describeAgente(p("Estructura", 3));
    expect(a.senal).toBe("Bajista");
    expect(a.tono).toBe("down");
    expect(a.empuje).toContain("abajo");
  });

  it("score medio → Neutral, no inclina", () => {
    const a = describeAgente(p("Inusualidad", 5));
    expect(a.senal).toBe("Neutral");
    expect(a.empuje).toContain("terreno medio");
  });

  it("sin dato → 'Sin dato' y sin empuje", () => {
    const a = describeAgente(p("Contexto IV", null));
    expect(a.senal).toBe("Sin dato");
    expect(a.tono).toBe("none");
    expect(a.empuje).toBeNull();
  });

  it("muestra lo que está viendo ahora (viene del note)", () => {
    const a = describeAgente(p("Confirmación de Precio", 6, "el precio valida"));
    expect(a.codigo).toBe("PRE");
    expect(a.viendo).toBe("el precio valida");
  });

  it("agente desconocido no revienta — usa las 3 primeras letras", () => {
    const a = describeAgente(p("Algo Nuevo", 7));
    expect(a.codigo).toBe("ALG");
  });

  it("describeMesa conserva el orden", () => {
    const mesa = describeMesa([p("Agresividad", 7), p("Convicción", 3)]);
    expect(mesa.map((m) => m.codigo)).toEqual(["AGR", "CNV"]);
  });
});
