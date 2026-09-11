import { describe, expect, it } from "vitest";
import { explicaPuntaje, type ParteScore } from "./explicaPuntaje";

const p = (name: string, score: number | null, weight = 20): ParteScore => ({ name, score, weight });

describe("explicaPuntaje", () => {
  it("sin señales con dato devuelve null", () => {
    expect(explicaPuntaje(0, [p("Agresividad", null), p("Convicción", null)])).toBeNull();
  });

  it("nombra lo que sube y lo que frena", () => {
    const s = explicaPuntaje(60, [p("Convicción", 8), p("Agresividad", 3), p("Inusualidad", 5)])!;
    expect(s).toContain("El puntaje es 60 (alcista).");
    expect(s).toContain("empuja arriba convicción");
    expect(s).toContain("frena agresividad");
  });

  it("etiqueta según el rango: 60+ alcista, 45-59 neutral, <45 bajista", () => {
    expect(explicaPuntaje(72, [p("Convicción", 8)])!).toContain("(alcista)");
    expect(explicaPuntaje(50, [p("Convicción", 5)])!).toContain("(neutral)");
    expect(explicaPuntaje(30, [p("Agresividad", 3)])!).toContain("(bajista)");
  });

  it("solo hay señales que suben → lo dice sin inventar un freno", () => {
    const s = explicaPuntaje(68, [p("Convicción", 8), p("Inusualidad", 7)])!;
    expect(s).toContain("ninguna señal lo está frenando");
  });

  it("solo hay señales que frenan → lo dice sin inventar un empuje", () => {
    const s = explicaPuntaje(38, [p("Agresividad", 3), p("Convicción", 4)])!;
    expect(s).toContain("ninguna señal lo empuja");
  });

  it("todo en terreno medio → dice que queda parejo", () => {
    const s = explicaPuntaje(50, [p("Agresividad", 5), p("Convicción", 5.5)])!;
    expect(s).toContain("terreno medio");
  });

  it("manda el de más peso × distancia, no cualquiera que pase el umbral", () => {
    // Convicción 7 peso 20 → fuerza (2×20)=40; Inusualidad 6.5 peso 20 → 30.
    // Debe nombrar Convicción como el que más empuja.
    const s = explicaPuntaje(62, [p("Convicción", 7, 20), p("Inusualidad", 6.5, 20)])!;
    expect(s).toContain("convicción");
  });
});
