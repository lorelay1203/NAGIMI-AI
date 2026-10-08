import { describe, expect, it } from "vitest";
import { elegirBaratos, fraseBarato } from "./contratosBaratos";
import type { TicketChainRow } from "./contractTicket";

const row = (o: Partial<TicketChainRow>): TicketChainRow => ({
  strike: 100, type: "call", bid: 0.04, ask: 0.05, delta: 0.1, gamma: 0.05, iv: 0.3, volume: 500, oi: 500,
  expiration: "2026-10-08", ...o,
});

describe("contratos que caben en $10", () => {
  const chain = [
    row({ strike: 101, bid: 0.30, ask: 0.32, delta: 0.35 }),   // $32: no cabe
    row({ strike: 102, bid: 0.08, ask: 0.09, delta: 0.15 }),   // $9: cabe y paga en la meta (103)
    row({ strike: 104, bid: 0.02, ask: 0.03, delta: 0.05 }),   // $3: cabe, pero más allá de la meta
    row({ strike: 99, type: "put", bid: 0.05, ask: 0.06, delta: -0.2 }),
  ];

  it("elige el de más probabilidad que cabe y paga si llega al imán", () => {
    const [b] = elegirBaratos("SPY", chain, { spot: 100, meta: 103, saldo: 10 });
    expect(b.strike).toBe(102);
    expect(b.costo).toBe(9);
    expect(b.contratos).toBe(1);
    expect(b.pagaEnMeta).toBe(true);
    expect(b.valorEnMeta).toBe(1);        // 103 − 102
    expect(b.multiplicador).toBeCloseTo(11.1, 1);
    expect(fraseBarato(b)).toContain("$0");
  });

  it("solo mira el lado del imán", () => {
    const r = elegirBaratos("SPY", chain, { spot: 100, meta: 103, saldo: 10 });
    expect(r.every((b) => b.type === "call")).toBe(true);
  });

  it("sin imán mira los dos lados", () => {
    const r = elegirBaratos("SPY", chain, { spot: 100, meta: null, saldo: 10 });
    expect(r.map((b) => b.type).sort()).toEqual(["call", "put"]);
  });

  it("descarta lo que nadie compra de vuelta o no se negocia", () => {
    const r = elegirBaratos("SPY", [row({ strike: 102, bid: 0, ask: 0.02 }), row({ strike: 102.5, volume: 3, oi: 20 })], { spot: 100, meta: 103, saldo: 10 });
    expect(r).toEqual([]);
  });

  it("con $3 solo cabe el lejano, y lo dice", () => {
    const [b] = elegirBaratos("SPY", chain, { spot: 100, meta: 103, saldo: 3 });
    expect(b.strike).toBe(104);
    expect(b.pagaEnMeta).toBe(false);
    expect(fraseBarato(b)).toContain("MÁS ALLÁ");
  });
});
