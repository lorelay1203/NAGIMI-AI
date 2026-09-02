import { describe, expect, it } from "vitest";
import { readTtFile, velocityFrom, etToday, STALE_MS, type TtBucket, type TtFile } from "./ttFlow";

const NOW = Date.parse("2026-09-01T18:00:00Z"); // 14:00 ET, mercado abierto

function bucket(o: Partial<TtBucket>): TtBucket {
  return {
    strike: 760, type: "call", ask: 0, bid: 0, mid: 0, trades: 0, volume: 0, oi: 0,
    gamma: 0.05, delta: 0.5, iv: 0.2, bidPrice: 1.00, askPrice: 1.10, ts: NOW, ...o,
  };
}
function file(buckets: TtBucket[], o: Partial<TtFile> = {}): TtFile {
  return {
    ticker: "SPY", date: etToday(new Date(NOW)), source: "tastytrade",
    updatedAt: new Date(NOW - 10_000).toISOString(), spot: 760, lastTradeAt: NOW,
    buckets: Object.fromEntries(buckets.map((b, i) => [`${b.type}:${b.strike}:${i}`, b])),
    samples: [], ...o,
  };
}

describe("velocityFrom", () => {
  it("ritmo constante = velocidad 1", () => {
    const s = Array.from({ length: 10 }, (_, i) => ({ t: NOW - (9 - i) * 60_000, contracts: i * 100 }));
    expect(velocityFrom(s, NOW)).toBeCloseTo(1, 1);
  });

  it("si la cinta acelera al final, la velocidad sube de 1", () => {
    const s = [
      { t: NOW - 600_000, contracts: 0 },
      { t: NOW - 300_000, contracts: 100 },
      { t: NOW - 120_000, contracts: 200 },
      { t: NOW - 60_000, contracts: 600 },
      { t: NOW, contracts: 1200 },
    ];
    expect(velocityFrom(s, NOW)!).toBeGreaterThan(2);
  });

  it("si se calma, baja de 1", () => {
    const s = [
      { t: NOW - 600_000, contracts: 0 },
      { t: NOW - 300_000, contracts: 900 },
      { t: NOW - 120_000, contracts: 1000 },
      { t: NOW, contracts: 1010 },
    ];
    expect(velocityFrom(s, NOW)!).toBeLessThan(1);
  });

  it("sin muestras suficientes devuelve null, no un 1 inventado", () => {
    expect(velocityFrom([], NOW)).toBeNull();
    expect(velocityFrom([{ t: NOW, contracts: 5 }], NOW)).toBeNull();
  });

  it("sin volumen no inventa velocidad", () => {
    const s = Array.from({ length: 5 }, (_, i) => ({ t: NOW - (4 - i) * 60_000, contracts: 0 }));
    expect(velocityFrom(s, NOW)).toBeNull();
  });
});

describe("readTtFile", () => {
  it("comprar calls cuenta como alcista", () => {
    const r = readTtFile(file([bucket({ type: "call", ask: 100 })]), NOW);
    expect(r.bull).toBeGreaterThan(0);
    expect(r.bear).toBe(0);
    expect(r.cvd).toBe(100);
  });

  it("vender calls cuenta como bajista", () => {
    const r = readTtFile(file([bucket({ type: "call", bid: 100 })]), NOW);
    expect(r.bear).toBeGreaterThan(0);
    expect(r.bull).toBe(0);
    expect(r.cvd).toBe(-100);
  });

  it("vender puts cuenta como alcista (piso de soporte)", () => {
    const r = readTtFile(file([bucket({ type: "put", bid: 100 })]), NOW);
    expect(r.bull).toBeGreaterThan(0);
    expect(r.bear).toBe(0);
  });

  it("comprar puts cuenta como bajista", () => {
    const r = readTtFile(file([bucket({ type: "put", ask: 100 })]), NOW);
    expect(r.bear).toBeGreaterThan(0);
    expect(r.bull).toBe(0);
  });

  it("pondera por prima: 1 contrato caro pesa más que 1 barato", () => {
    const caro = readTtFile(file([bucket({ type: "call", ask: 10, bidPrice: 9.9, askPrice: 10.1 })]), NOW);
    const barato = readTtFile(file([bucket({ type: "call", ask: 10, bidPrice: 0.04, askPrice: 0.06 })]), NOW);
    expect(caro.bull).toBeGreaterThan(barato.bull);
  });

  it("marca como viejo lo que no se actualiza", () => {
    const viejo = file([bucket({ ask: 10 })], { updatedAt: new Date(NOW - STALE_MS - 60_000).toISOString() });
    const r = readTtFile(viejo, NOW);
    expect(r.fresco).toBe(false);
    expect(r.motivo).toMatch(/viejos/i);
  });

  it("un fichero de otro día no se da por fresco", () => {
    const ayer = file([bucket({ ask: 10 })], { date: "2026-08-31" });
    expect(readTtFile(ayer, NOW).fresco).toBe(false);
  });

  it("lo recién escrito sí es fresco", () => {
    expect(readTtFile(file([bucket({ ask: 10 })]), NOW).fresco).toBe(true);
  });

  it("un fichero sin datos no revienta", () => {
    const r = readTtFile(file([]), NOW);
    expect(r.bull).toBe(0);
    expect(r.strikes).toBe(0);
    expect(r.velocity).toBeNull();
  });
});
