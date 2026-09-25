import { describe, expect, it } from "vitest";
import { cabeEnCuenta, cuandoVence, lineasTicket, ticketComoTexto, type TicketLike } from "./ticketTexto";

// El ejemplo del Agente 0DTE: BUY SPX 7710 C @ 6.70, target 27.98 (idx 7735), stop 2.79 (idx 7665)
const T: TicketLike = {
  strike: 7710, type: "call", expiration: "2026-09-03",
  bid: 6.6, ask: 6.8, mid: 6.7, targetPx: 27.98, stopPx: 2.79, rbOption: 5.4,
  cost: 670, risk: 391, gainPct: 318, lossPct: 58, approxPop: 42,
  warning: "La ganancia sale inflada: puede ser optimista.",
};
const S = { direction: "long" as const, entry: 7700, target: 7735, stop: 7665 };
// 10:29 AM de Nueva York el 3 de septiembre de 2026
const AHORA = new Date("2026-09-03T14:29:00Z");

describe("cabeEnCuenta", () => {
  it("con $1,000 y regla del 1% solo se pueden perder $10", () => {
    expect(cabeEnCuenta(391, 1000)).toEqual({ permitido: 10, contratos: 0, pctDeCuenta: 39.1 });
  });
  it("cuenta cuántos contratos caben", () => {
    expect(cabeEnCuenta(40, 10000).contratos).toBe(2);
  });
  it("sin capital no cabe nada y no divide por cero", () => {
    expect(cabeEnCuenta(40, 0)).toEqual({ permitido: 0, contratos: 0, pctDeCuenta: null });
  });
});

describe("cuandoVence", () => {
  it("dice 'vence hoy' en el día de Nueva York", () => {
    expect(cuandoVence("2026-09-03", AHORA)).toBe("vence hoy");
  });
  it("a las 9 PM de Puerto Rico todavía cuenta el día de Nueva York", () => {
    // 01:00 UTC del día 4 = 9 PM del 3 en Nueva York
    expect(cuandoVence("2026-09-03", new Date("2026-09-04T01:00:00Z"))).toBe("vence hoy");
  });
  it("otro día → fecha", () => {
    expect(cuandoVence("2026-09-05", AHORA)).toMatch(/^vence el /);
  });
});

describe("lineasTicket", () => {
  const L = lineasTicket({ ticker: "SPX", setup: S, ticket: T, estrategia: "empujon", capital: 1000, ahora: AHORA });
  const txt = ticketComoTexto(L);

  it("sigue el orden del Agente 0DTE: compra, meta, salida, costo", () => {
    const iconos = L.map((l) => l.icono);
    expect(iconos.indexOf("🟢")).toBeLessThan(iconos.indexOf("🎯"));
    expect(iconos.indexOf("🎯")).toBeLessThan(iconos.indexOf("🛑"));
    expect(iconos.indexOf("🛑")).toBeLessThan(iconos.indexOf("💵"));
  });

  it("dice los mismos números que el original", () => {
    expect(txt).toContain("COMPRA SPX 7,710 CALL");
    expect(txt).toContain("a $6.70");
    expect(txt).toContain("$27.98");
    expect(txt).toContain("SPX en 7,735");
    expect(txt).toContain("+318%");
    expect(txt).toContain("$2.79");
    expect(txt).toContain("−58%");
    expect(txt).toContain("ganas 5.4 por cada 1");
    expect(txt).toContain("te cuesta $670");
    expect(txt).toContain("arriesgas $391");
  });

  it("no usa siglas del original", () => {
    for (const sigla of ["BUY", "target", "stop", "R:B", "idx", "Δ", "Γ", "IV", "risk", "cost"]) {
      expect(txt).not.toContain(sigla);
    }
  });

  it("avisa que no cabe con la regla del 1%", () => {
    const l = L.find((x) => x.icono === "⛔");
    expect(l?.texto).toMatch(/No cabe/);
    expect(l?.texto).toContain("$10");
  });

  it("si cabe, lo dice y cuántos", () => {
    const ok = lineasTicket({ ticker: "SPY", setup: S, ticket: { ...T, risk: 8, cost: 20 }, estrategia: "iman", capital: 1000, ahora: AHORA });
    expect(ok.find((x) => x.icono === "✅")?.texto).toMatch(/te caben 1 contrato\./);
  });

  it("dice la hora de Nueva York", () => {
    expect(txt).toMatch(/10:29/);
    expect(txt).toContain("hora de Nueva York");
  });

  it("un put se explica como apuesta a que baja", () => {
    const p = lineasTicket({ ticker: "SPY", setup: { ...S, direction: "short" }, ticket: { ...T, type: "put" }, estrategia: "empujon", capital: 1000, ahora: AHORA });
    expect(ticketComoTexto(p)).toContain("PUT (apuesta a que baja)");
  });
});
