import { describe, expect, it } from "vitest";
import { analyzeMarketPressure } from "./marketPressure";
import type { FlowRow } from "./flow";

function row(o: Partial<FlowRow>): FlowRow {
  return {
    id: 1, symbol: "X", underlying: "X", type: "call", strike: 100, expiration: "2026-09-18",
    dte: 20, price: 1, size: 1, side: "ask", aggression: "ask", assetPrice: 100,
    bid: 0.9, ask: 1.1, premium: 1_000_000, delta: 0.5, gamma: 0, theta: 0, vega: 0,
    thetaPctDaily: null, iv: 0.2, openInterest: 10, volume: 10, score: 0,
    ...o,
  } as FlowRow;
}

describe("analyzeMarketPressure", () => {
  it("compra de calls = alcista", () => {
    const r = analyzeMarketPressure([row({ type: "call", aggression: "ask", premium: 5e6 })]);
    expect(r.bias).toBe("alcista");
    expect(r.bullishPct).toBe(100);
    expect(r.headline).toMatch(/Compra de calls/);
  });

  it("venta de calls = bajista, aunque el 100% del premium sean calls", () => {
    const r = analyzeMarketPressure([row({ type: "call", aggression: "bid", premium: 5e6 })]);
    expect(r.type.calls).toBe(5e6); // todo el premium es de calls...
    expect(r.bias).toBe("bajista"); // ...pero se vendieron
    expect(r.headline).toMatch(/Venta de calls/);
  });

  it("venta de puts = alcista (soporte)", () => {
    const r = analyzeMarketPressure([row({ type: "put", aggression: "bid", premium: 5e6 })]);
    expect(r.bias).toBe("alcista");
    expect(r.headline).toMatch(/confianza en el piso/);
  });

  it("compra de puts = bajista", () => {
    const r = analyzeMarketPressure([row({ type: "put", aggression: "ask", premium: 5e6 })]);
    expect(r.bias).toBe("bajista");
    expect(r.headline).toMatch(/Compra de puts/);
  });

  it("reparte el premium por lado del libro y por tipo", () => {
    const r = analyzeMarketPressure([
      row({ type: "call", aggression: "ask", premium: 3e6 }),
      row({ type: "put", aggression: "bid", premium: 1e6 }),
      row({ type: "call", aggression: "mid", premium: 1e6 }),
    ]);
    expect(r.side).toMatchObject({ ask: 3e6, bid: 1e6, mid: 1e6, total: 5e6 });
    expect(r.type).toMatchObject({ calls: 4e6, puts: 1e6 });
  });

  it("empate deja el sesgo neutral", () => {
    const r = analyzeMarketPressure([
      row({ type: "call", aggression: "ask", premium: 5e6 }),
      row({ type: "call", aggression: "bid", premium: 5e6 }),
    ]);
    expect(r.bias).toBe("neutral");
    expect(r.bullishPct).toBe(50);
  });

  it("sin premium direccional no inventa dirección", () => {
    const r = analyzeMarketPressure([row({ aggression: "mid", premium: 5e6 })]);
    expect(r.bullishPct).toBeNull();
    expect(r.bias).toBe("neutral");
    expect(r.caveats.join(" ")).toMatch(/en el medio/);
  });

  it("avisa cuando hay poco premium", () => {
    const r = analyzeMarketPressure([row({ premium: 1000 })]);
    expect(r.caveats.join(" ")).toMatch(/Poco premium/);
  });

  it("lista vacía no revienta", () => {
    const r = analyzeMarketPressure([]);
    expect(r.side.total).toBe(0);
    expect(r.bullishPct).toBeNull();
  });
});
