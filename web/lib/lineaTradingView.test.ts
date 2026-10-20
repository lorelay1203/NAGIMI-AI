import { describe, expect, it } from "vitest";
import { armarLineaTradingView, fechaNY, leerLineaTradingView, perfilCompacto, VERSION_LINEA } from "./lineaTradingView";

const base = {
  ticker: "spy", fecha: "2026-10-20", spot: 775,
  callWall: 777.243, putWall: 772.25, magnet: 779.73, gammaFlip: 772.7449,
  regime: "positive" as const, flujoAlcistaPct: 58.4,
  bars: [
    { strike: 770, netGex: -1.2e9 }, { strike: 775, netGex: 3.4e8 }, { strike: 780, netGex: 2.5e9 },
    { strike: 900, netGex: 9e9 },   // lejos del precio: fuera
    { strike: 776, netGex: 0 },     // cero: fuera
  ],
};

describe("línea para TradingView", () => {
  it("arma todos los campos en el orden esperado", () => {
    const l = armarLineaTradingView(base);
    expect(l.startsWith(VERSION_LINEA + "|t=SPY|d=2026-10-20|")).toBe(true);
    const k = leerLineaTradingView(l);
    expect(k.cw).toBe("777.24");
    expect(k.pw).toBe("772.25");
    expect(k.mag).toBe("779.73");
    expect(k.flip).toBe("772.74");
    expect(k.reg).toBe("+");
    expect(k.fb).toBe("58");
    expect(k.g).toBe("770:-1200.0,775:340.0,780:2500.0");
  });

  it("omite lo que no hay, y el día de empujón lleva '-'", () => {
    const l = armarLineaTradingView({ ...base, callWall: null, flujoAlcistaPct: null, regime: "negative", bars: [] });
    const k = leerLineaTradingView(l);
    expect(k.cw).toBeUndefined();
    expect(k.fb).toBeUndefined();
    expect(k.g).toBeUndefined();
    expect(k.reg).toBe("-");
  });

  it("el perfil se queda con los más fuertes cerca del precio", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ strike: 760 + i, netGex: (i + 1) * 1e6 }));
    const p = perfilCompacto(muchos, 775);
    expect(p.length).toBe(14);
    expect(p[p.length - 1].strike).toBe(789);       // el más fuerte
    expect(p.every((b, i) => i === 0 || b.strike > p[i - 1].strike)).toBe(true);
  });

  it("fecha de Nueva York", () => {
    // 1:30 AM UTC del 21 = 9:30 PM del 20 en Nueva York
    expect(fechaNY(new Date("2026-10-21T01:30:00Z"))).toBe("2026-10-20");
  });
});
