import { describe, expect, it } from "vitest";
import { buildCreditPlan, pasoDeStrikes } from "./creditSpread0dte";
import type { TicketChainRow } from "./contractTicket";

function fila(o: Partial<TicketChainRow> & { strike: number; type: "call" | "put" }): TicketChainRow {
  return { bid: 1, ask: 1.1, delta: 0.1, gamma: 0.001, iv: 0.2, volume: 100, oi: 100, ...o };
}

describe("pasoDeStrikes", () => {
  it("saca la separación típica aunque haya un hueco", () => {
    expect(pasoDeStrikes([7600, 7605, 7610, 7615, 7650])).toBe(5);
  });
  it("con un solo strike no revienta", () => {
    expect(pasoDeStrikes([100])).toBe(1);
  });
});

describe("buildCreditPlan", () => {
  const base = { spot: 100, callWall: 105, putWall: 95, regimen: "positive" as const, capital: 1000 };

  it("sin cadena no inventa nada", () => {
    const p = buildCreditPlan("X", [], base);
    expect(p.candidatos).toEqual([]);
    expect(p.aviso).toContain("no hay ningún spread");
  });

  it("cobra al bid y compra al ask, nunca al precio medio", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 2.0, ask: 2.4, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 1.0, ask: 1.4, delta: 0.1 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    const c = p.candidatos.find((x) => x.vender === 105 && x.comprar === 106)!;
    // Peor caso: 2.00 (bid) − 1.40 (ask) = 0.60 → $60. Con medios saldría $80.
    expect(c.credito).toBe(60);
    expect(c.riesgoMax).toBe(40);
  });

  it("descarta el que no deja crédito en vez de mostrarlo en negativo", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.05, ask: 0.10 }),
      fila({ strike: 106, type: "call", bid: 0.05, ask: 0.10 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    expect(p.candidatos).toEqual([]);
    expect(p.descartados.some((d) => d.motivo.includes("crédito"))).toBe(true);
  });

  it("descarta el que paga menos del mínimo aunque deje crédito (caso real SPX)", () => {
    // 7660/7665 de hoy: cobras 0.25, pagas 0.20 → $5 contra $495.
    const rows = [
      fila({ strike: 7660, type: "call", bid: 0.25, ask: 0.30, delta: 0.067 }),
      fila({ strike: 7665, type: "call", bid: 0.10, ask: 0.20, delta: 0.036 }),
    ];
    const p = buildCreditPlan("SPX", rows, { ...base, spot: 7644, callWall: 7825, putWall: 7630 });
    expect(p.candidatos).toEqual([]);
    expect(p.descartados.some((d) => d.motivo.includes("menos del"))).toBe(true);
  });

  it("marca el que no cabe y dice cuánto falta", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 2.0, ask: 2.0, delta: 0.2 }),
      fila({ strike: 110, type: "call", bid: 0.5, ask: 0.5, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, capital: 100 });
    const c = p.candidatos[0];
    expect(c.riesgoMax).toBe(350); // (5 × 100) − 150
    expect(c.cabe).toBe(false);
    expect(c.faltan).toBe(250);
    expect(p.aviso).toContain("Ninguno cabe");
  });

  it("calcula la esperanza y la deja negativa cuando lo es", () => {
    // 90% de acierto, cobras $20, arriesgas $180 → 0.9×20 − 0.1×180 = 0
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.20, ask: 0.20, delta: 0.10 }),
      fila({ strike: 107, type: "call", bid: 0.0, ask: 0.0, delta: 0.02 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    const c = p.candidatos[0];
    expect(c.popPct).toBe(90);
    expect(c.esperanza).toBeCloseTo(0.9 * c.credito - 0.1 * c.riesgoMax, 2);
  });

  it("solo considera strikes fuera del dinero", () => {
    const rows = [
      fila({ strike: 95, type: "call", bid: 6, ask: 6.2, delta: 0.9 }),  // dentro
      fila({ strike: 96, type: "call", bid: 5, ask: 5.2, delta: 0.85 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    expect(p.candidatos.every((c) => c.vender > base.spot)).toBe(true);
  });

  it("marca cuáles quedan más allá del muro de gamma", () => {
    const rows = [
      fila({ strike: 103, type: "call", bid: 1.0, ask: 1.0, delta: 0.3 }),
      fila({ strike: 104, type: "call", bid: 0.6, ask: 0.6, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 0.5, ask: 0.5, delta: 0.15 }),
      fila({ strike: 107, type: "call", bid: 0.1, ask: 0.1, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, base); // callWall 105
    expect(p.candidatos.find((c) => c.vender === 106)?.trasElMuro).toBe(true);
    expect(p.candidatos.find((c) => c.vender === 103)?.trasElMuro).toBe(false);
  });

  it("en gamma negativa avisa antes de dar números", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.60, ask: 0.70, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 0.25, ask: 0.30, delta: 0.1 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, regimen: "negative" });
    expect(p.aviso).toContain("gamma NEGATIVA");
  });

  it("acumula los avisos: gamma negativa Y esperanza negativa a la vez", () => {
    // Caso real del SPX: cabe, pero el GEX está negativo y la cuenta no sale.
    const rows = [
      fila({ strike: 7650, type: "call", bid: 1.60, ask: 1.70, delta: 0.42 }),
      fila({ strike: 7655, type: "call", bid: 0.20, ask: 0.20, delta: 0.20 }),
    ];
    const p = buildCreditPlan("SPX", rows, {
      spot: 7646, callWall: 7825, putWall: 7645, regimen: "negative", capital: 900,
    });
    expect(p.candidatos.length).toBeGreaterThan(0);
    expect(p.aviso).toContain("gamma NEGATIVA");
    expect(p.aviso).toContain("pierden dinero a la larga");
  });

  it("pone primero los que caben en la cuenta", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.60, ask: 0.70, delta: 0.20 }),
      fila({ strike: 106, type: "call", bid: 0.40, ask: 0.45, delta: 0.15 }),
      fila({ strike: 107, type: "call", bid: 0.25, ask: 0.30, delta: 0.12 }),
      fila({ strike: 108, type: "call", bid: 0.15, ask: 0.20, delta: 0.09 }),
      fila({ strike: 110, type: "call", bid: 0.05, ask: 0.10, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, capital: 120 });
    expect(p.candidatos[0].cabe).toBe(true);
    // El de ancho 5 paga más ($50) pero arriesga $450: va después del que cabe.
    expect(p.candidatos.some((c) => !c.cabe && c.riesgoMax > 400)).toBe(true);
  });
});
