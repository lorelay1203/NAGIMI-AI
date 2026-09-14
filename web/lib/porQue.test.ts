import { describe, expect, it } from "vitest";
import {
  horizonteTxt,
  imanCercaDe,
  porQueAFavor,
  porQueEnContra,
  porQueVigila,
} from "./porQue";

describe("horizonteTxt", () => {
  it("dice el horizonte como lo diría una persona", () => {
    expect(horizonteTxt(10)).toBe("la próxima semana");
    expect(horizonteTxt(20)).toBe("las próximas dos semanas");
    expect(horizonteTxt(30)).toBe("el próximo mes");
  });
});

describe("imanCercaDe", () => {
  const levels = [
    { strike: 220, magnet: 0.09, side: "call" as const },
    { strike: 220.5, magnet: 0.04, side: "call" as const },
    { strike: 200, magnet: 0.31, side: "put" as const },
  ];

  it("agarra el nivel pegado al precio, no el más pesado del mapa", () => {
    expect(imanCercaDe(levels, 220)?.strike).toBe(220);
  });

  it("entre dos pegados se queda con el más pesado", () => {
    expect(imanCercaDe(levels, 220.4)?.strike).toBe(220);
  });

  it("si no hay nada cerca devuelve null en vez de inventar", () => {
    expect(imanCercaDe(levels, 150)).toBeNull();
  });
});

describe("porQueAFavor", () => {
  const iman = { strike: 220, magnet: 0.09, side: "call" as const };

  it("explica de dónde sale el número y aclara TOCAR vs CERRAR", () => {
    const t = porQueAFavor({ spot: 210, target: 220, probability: 0.9, iman, regimen: "positive", horizonDays: 20 });
    expect(t).toContain("9%");
    expect(t).toContain("$220.00");
    expect(t).toContain("TOQUE");
    expect(t).toContain("NO quiere decir que va a cerrar");
  });

  it("en gamma positiva usa la imagen del tazón", () => {
    const t = porQueAFavor({ spot: 210, target: 220, probability: 0.9, iman, regimen: "positive", horizonDays: 20 });
    expect(t).toContain("tazón");
  });

  it("en gamma negativa avisa que el imán agarra menos", () => {
    const t = porQueAFavor({ spot: 210, target: 220, probability: 0.9, iman, regimen: "negative", horizonDays: 20 });
    expect(t).toContain("gamma está negativa");
    expect(t).not.toContain("tazón");
  });

  it("sin imán dice que es una referencia floja en vez de fingir un ancla", () => {
    const t = porQueAFavor({ spot: 210, target: 220, probability: 0.5, iman: null, regimen: "positive", horizonDays: 10 });
    expect(t).toContain("referencia floja");
    // Sin imán no tiene sentido hablar del efecto del régimen sobre el imán.
    expect(t).not.toContain("tazón");
  });

  it("con el imán encima del precio no vende el ~100% como promesa de ganancia", () => {
    // Caso real NVDA: spot $219.05, imán $217.50 → probTouch ≈ 100%.
    const t = porQueAFavor({
      spot: 219.05, target: 217.5, probability: 0.999,
      iman: { strike: 217.5, magnet: 0.17, side: "put" }, regimen: "positive", horizonDays: 20,
    });
    expect(t).toContain("no es una promesa de ganancia");
    expect(t).toContain("ya está ahí");
    expect(t).not.toContain("muy probable que lo TOQUE");
  });

  it("con el target lejos sí usa la aclaración de TOCAR vs CERRAR", () => {
    const t = porQueAFavor({ spot: 200, target: 220, probability: 0.6, iman, regimen: "positive", horizonDays: 20 });
    expect(t).toContain("muy probable que lo TOQUE");
    expect(t).not.toContain("ya está ahí");
  });
});

describe("porQueEnContra", () => {
  it("lo presenta como el tamaño del golpe, no como un pronóstico", () => {
    const t = porQueEnContra({
      target: 200, probability: 0.42, sigmaPct: 6.3, horizonDays: 20,
      muro: { strike: 200, magnet: 0.31, side: "put" },
    });
    expect(t).toContain("no es una predicción");
    expect(t).toContain("±6.3%");
    expect(t).toContain("42%");
    expect(t).toContain("$200.00");
    expect(t).toContain("31%");
  });

  it("sin muro dice que el número sale puro de la volatilidad", () => {
    const t = porQueEnContra({ target: 200, probability: 0.42, sigmaPct: 6.3, horizonDays: 20, muro: null });
    expect(t).toContain("puro de la volatilidad");
    expect(t).not.toContain("del mapa");
  });

  it("cierra empujando a dimensionar la posición", () => {
    const t = porQueEnContra({ target: 200, probability: 0.42, sigmaPct: 6.3, horizonDays: 20, muro: null });
    expect(t).toContain("cuánto metes");
  });
});

describe("porQueVigila", () => {
  it("en un piso explica la compra de cobertura con la imagen de los colchones", () => {
    const t = porQueVigila({ strike: 200, esPiso: true, side: "put", regimen: "positive" });
    expect(t).toContain("COMPRAR");
    expect(t).toContain("colchones");
    expect(t).toContain("$200.00");
  });

  it("en un techo explica la venta de cobertura, no la compra", () => {
    const t = porQueVigila({ strike: 240, esPiso: false, side: "call", regimen: "positive" });
    expect(t).toContain("VENDER");
    expect(t).toContain("techo bajito");
    expect(t).not.toContain("colchones");
  });

  it("siempre avisa que no es garantía y que roto se acelera", () => {
    for (const esPiso of [true, false]) {
      const t = porQueVigila({ strike: 200, esPiso, side: null, regimen: undefined });
      expect(t).toContain("no es garantía");
      expect(t).toContain("se acelera");
    }
  });

  it("en gamma negativa avisa que los muros aguantan menos", () => {
    const t = porQueVigila({ strike: 200, esPiso: true, side: "put", regimen: "negative" });
    expect(t).toContain("aguantan menos");
  });
});
