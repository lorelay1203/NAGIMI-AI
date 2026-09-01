import { describe, expect, it } from "vitest";
import { pickTicket, projectPx, ticketParamsFor, type TicketChainRow } from "./contractTicket";
import type { PinSetup } from "./pinStrategy";

/** Setup largo: el precio está en 100 y vuelve al imán 104; stop en 98. */
const LONG: PinSetup = { direction: "long", entry: 100, target: 104, stop: 98, reason: "x" };
/** Setup corto: precio 100, imán 96, stop 102. */
const SHORT: PinSetup = { direction: "short", entry: 100, target: 96, stop: 102, reason: "x" };

function row(o: Partial<TicketChainRow>): TicketChainRow {
  return {
    strike: 100, type: "call", bid: 1.00, ask: 1.04, delta: 0.50, gamma: 0.05,
    iv: 0.30, volume: 5000, oi: 5000, expiration: "2026-09-01", symbol: "O:X", ...o,
  };
}

describe("projectPx", () => {
  it("un call sube de precio cuando la acción sube", () => {
    expect(projectPx(1, 0.5, 0.05, +4)).toBeGreaterThan(1);
  });
  it("un put sube de precio cuando la acción baja", () => {
    expect(projectPx(1, -0.5, 0.05, -4)).toBeGreaterThan(1);
  });
  it("la gamma amortigua la pérdida (cae menos que el puro delta)", () => {
    const conGamma = projectPx(1, 0.5, 0.05, -2);
    const soloDelta = 1 + 0.5 * -2;
    expect(conGamma).toBeGreaterThan(soloDelta);
  });
  it("nunca baja de $0.05", () => {
    expect(projectPx(1, 0.5, 0, -50)).toBe(0.05);
  });
});

describe("ticketParamsFor (adaptación a cuenta chica)", () => {
  it("con cuenta chica amplía la banda de delta hacia abajo (contratos baratos)", () => {
    const chica = ticketParamsFor(100);
    expect(chica.deltaMin).toBeLessThan(0.40);
    expect(chica.deltaTarget).toBeLessThan(0.50);
  });
  it("con cuenta grande usa la banda clásica 0.40-0.60", () => {
    const grande = ticketParamsFor(5000);
    expect(grande.deltaMin).toBe(0.40);
    expect(grande.deltaTarget).toBe(0.50);
  });
  it("los topes de coste y riesgo salen del capital", () => {
    expect(ticketParamsFor(100).maxCost).toBeCloseTo(40, 5);
    expect(ticketParamsFor(100).maxRisk).toBeCloseTo(35, 5);
  });
  it("un capital absurdo no rompe (usa 100 por defecto)", () => {
    expect(ticketParamsFor(0).maxCost).toBeCloseTo(40, 5);
  });
});

describe("pickTicket", () => {
  const params = ticketParamsFor(5000); // cuenta grande: no estorban los topes

  it("elige CALL para un setup largo y PUT para uno corto", () => {
    const chain = [row({ type: "call" }), row({ type: "put", delta: -0.50 })];
    expect(pickTicket(LONG, 100, chain, params).ticket?.type).toBe("call");
    expect(pickTicket(SHORT, 100, chain, params).ticket?.type).toBe("put");
  });

  it("prefiere la delta más cercana a la ideal", () => {
    const chain = [
      row({ strike: 95, delta: 0.58 }),
      row({ strike: 100, delta: 0.50 }), // la ideal
      row({ strike: 105, delta: 0.42 }),
    ];
    expect(pickTicket(LONG, 100, chain, params).ticket?.strike).toBe(100);
  });

  it("calcula coste y riesgo por contrato en dólares", () => {
    const t = pickTicket(LONG, 100, [row({})], params).ticket!;
    expect(t.cost).toBeCloseTo(102, 0);          // mid 1.02 × 100
    expect(t.risk).toBeGreaterThan(0);
    expect(t.risk).toBeLessThan(t.cost);          // no se pierde más de lo que cuesta
    expect(t.targetPx).toBeGreaterThan(t.mid);
    expect(t.stopPx).toBeLessThan(t.mid);
  });

  it("descarta la horquilla muy abierta (poca liquidez)", () => {
    const r = pickTicket(LONG, 100, [row({ bid: 0.50, ask: 1.50 })], params);
    expect(r.ticket).toBeNull();
    expect(r.reason).toMatch(/horquilla/i);
  });

  it("descarta lo que no tiene volumen ni interés abierto", () => {
    const r = pickTicket(LONG, 100, [row({ volume: 0, oi: 0 })], params);
    expect(r.ticket).toBeNull();
    expect(r.reason).toMatch(/liquidez/i);
  });

  it("descarta contratos fuera de la banda de delta", () => {
    const r = pickTicket(LONG, 100, [row({ delta: 0.95 })], params);
    expect(r.ticket).toBeNull();
    expect(r.reason).toMatch(/delta/i);
  });

  // Lo importante para cuenta chica: si no cabe, hay que DECIRLO, no callar.
  it("con $100 avisa cuando el contrato se sale de presupuesto", () => {
    const chico = ticketParamsFor(100); // maxCost = $40
    const r = pickTicket(LONG, 100, [row({ bid: 3.00, ask: 3.10, delta: 0.30 })], chico);
    expect(r.ticket).toBeNull();
    expect(r.reason).toMatch(/cuesta[n]? más|cuenta/i);
  });

  it("con $100 sí encuentra un contrato barato que cabe", () => {
    const chico = ticketParamsFor(100);
    const chain = [row({ strike: 103, bid: 0.20, ask: 0.21, delta: 0.25, gamma: 0.04 })];
    const t = pickTicket(LONG, 100, chain, chico, 100).ticket;
    expect(t).not.toBeNull();
    expect(t!.cost).toBeCloseTo(20.5, 1);
    expect(t!.costPctOfCapital).toBeCloseTo(20.5, 1); // 20% de la cuenta
    expect(t!.riskPctOfCapital).not.toBeNull();
  });

  it("una cadena vacía no revienta", () => {
    const r = pickTicket(LONG, 100, [], params);
    expect(r.ticket).toBeNull();
    expect(r.reason).toMatch(/no trae/i);
  });

  it("sin precios válidos del setup no inventa nada", () => {
    const malo: PinSetup = { ...LONG, target: 0 };
    expect(pickTicket(malo, 100, [row({})], params).ticket).toBeNull();
  });
});

describe("aviso de probabilidad (lo que evita leer un R:B enorme como dinero fácil)", () => {
  it("un contrato barato y lejano avisa de que es poco probable", () => {
    const chico = ticketParamsFor(100);
    const chain = [row({ strike: 103, bid: 0.20, ask: 0.21, delta: 0.22, gamma: 0.06 })];
    const t = pickTicket(LONG, 100, chain, chico, 100).ticket!;
    expect(t.approxPop).toBeCloseTo(22, 0);
    expect(t.warning).toMatch(/poco probable|Probabilidad baja/i);
  });

  it("un contrato al dinero no lleva aviso", () => {
    const t = pickTicket(LONG, 100, [row({ delta: 0.50 })], ticketParamsFor(5000)).ticket!;
    expect(t.approxPop).toBeCloseTo(50, 0);
    expect(t.warning).toBeNull();
  });
});
