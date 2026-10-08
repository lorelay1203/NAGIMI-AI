import { describe, expect, it } from "vitest";
import { convertirNiveles, elegirProporcion, indiceEspejo } from "./nivelesEspejo";
import type { DayGexLevels } from "./dayGex";

const SPX: DayGexLevels = {
  ticker: "SPX", source: "schwab", spot: 7800, callWall: 7850, putWall: 7750, magnet: 7825,
  gammaFlip: 7790, maxPain: null, netGex: 2.9e10, regime: "positive",
  bars: [{ strike: 7800, callGex: 1, putGex: 0, netGex: 1 }], iv: null, asOf: "2026-10-08T15:00:00Z",
};

describe("muros espejo (índice → ETF)", () => {
  it("SPY usa el SPX y QQQ usa el NDX", () => {
    expect(indiceEspejo("spy")).toBe("SPX");
    expect(indiceEspejo("QQQ")).toBe("NDX");
    expect(indiceEspejo("NVDA")).toBeNull();
  });

  it("usa la proporción de ahora si cuadra con la del cierre", () => {
    expect(elegirProporcion(0.0996, 0.0997)).toEqual({ ratio: 0.0996, origen: "vivo" });
  });

  it("si un precio viene atrasado, usa la del cierre", () => {
    // 1% de diferencia: alguno de los dos precios está viejo.
    expect(elegirProporcion(0.1007, 0.0997)).toEqual({ ratio: 0.0997, origen: "cierre" });
    expect(elegirProporcion(null, 0.0997)?.origen).toBe("cierre");
    expect(elegirProporcion(null, null)).toBeNull();
  });

  it("pasa los muros a precios de SPY y deja el GEX en escala del índice", () => {
    const n = convertirNiveles(SPX, "SPY", 777.5, { ratio: 0.1, origen: "vivo" });
    expect(n.ticker).toBe("SPY");
    expect(n.spot).toBe(777.5);
    expect(n.callWall).toBe(785);
    expect(n.putWall).toBe(775);
    expect(n.magnet).toBe(782.5);
    expect(n.gammaFlip).toBe(779);
    expect(n.bars[0].strike).toBe(780);
    expect(n.netGex).toBe(2.9e10);
    expect(n.espejo?.indice).toBe("SPX");
    expect(n.espejo?.original.magnet).toBe(7825);
  });
});
