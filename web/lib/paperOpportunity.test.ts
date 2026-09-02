import { describe, expect, it } from "vitest";
import {
  diasRestantes, estadoTiempo, evaluarOportunidad, mejorQueAntes, netoDe, porQueDeLaOportunidad, vencimientoDe, yaCorrio,
  type PrecioPata,
} from "./paperOpportunity";
import type { PaperTrade } from "./paper";

const HOY = "2026-09-02";

function trade(o: Partial<PaperTrade> = {}): PaperTrade {
  return {
    id: "t1", ticker: "SPY", label: "Bull call 760/765",
    legs: [
      { type: "call", side: "buy", strike: 760, expiration: "2026-09-05", qty: 1 },
      { type: "call", side: "sell", strike: 765, expiration: "2026-09-05", qty: 1 },
    ],
    entryNet: 2.0, qtyContracts: 1, entryTime: "2026-09-01T14:00:00Z",
    status: "open", source: "motor", ...o,
  };
}
const precios = (a: number, b: number): PrecioPata[] => [
  { strike: 760, type: "call", mid: a },
  { strike: 765, type: "call", mid: b },
];

describe("tiempo", () => {
  it("cuenta los días que faltan", () => {
    expect(diasRestantes("2026-09-05", HOY)).toBe(3);
    expect(diasRestantes("2026-09-02", HOY)).toBe(0);
    expect(diasRestantes("2026-08-30", HOY)).toBe(-3);
  });

  it("clasifica vencido, vence hoy y vigente", () => {
    expect(estadoTiempo(trade({ legs: [{ type: "call", side: "buy", strike: 1, expiration: "2026-08-01", qty: 1 }] }), HOY).estado).toBe("vencido");
    expect(estadoTiempo(trade({ legs: [{ type: "call", side: "buy", strike: 1, expiration: HOY, qty: 1 }] }), HOY).estado).toBe("vence_hoy");
    expect(estadoTiempo(trade(), HOY).estado).toBe("vigente");
  });

  it("toma el vencimiento más cercano de las patas", () => {
    expect(vencimientoDe(trade())).toBe("2026-09-05");
  });
});

describe("netoDe", () => {
  it("un débito sale positivo (pagas)", () => {
    expect(netoDe([
      { side: "buy", optionType: "call", strike: 760, quantity: 1, limitPrice: 3 },
      { side: "sell", optionType: "call", strike: 765, quantity: 1, limitPrice: 1 },
    ])).toBe(2);
  });
  it("un crédito sale negativo (cobras)", () => {
    expect(netoDe([
      { side: "sell", optionType: "put", strike: 750, quantity: 1, limitPrice: 3 },
      { side: "buy", optionType: "put", strike: 745, quantity: 1, limitPrice: 1 },
    ])).toBe(-2);
  });
});

describe("yaCorrio", () => {
  it("un débito que se encareció mucho ya corrió", () => {
    expect(yaCorrio(2.0, 3.2)).toBe(true);
  });
  it("un débito parecido sigue entrable", () => {
    expect(yaCorrio(2.0, 2.1)).toBe(false);
  });
  it("un crédito que ahora paga mucho menos ya corrió", () => {
    expect(yaCorrio(-2.0, -1.0)).toBe(true);
  });
  it("un crédito parecido sigue entrable", () => {
    expect(yaCorrio(-2.0, -1.8)).toBe(false);
  });
  it("un débito MÁS BARATO no es 'ya corrió' (es mejor entrada)", () => {
    expect(yaCorrio(2.0, 1.2)).toBe(false);
  });
});

describe("evaluarOportunidad", () => {
  it("lo vencido se marca y no se puede entrar", () => {
    const t = trade({ legs: [
      { type: "call", side: "buy", strike: 760, expiration: "2026-08-20", qty: 1 },
      { type: "call", side: "sell", strike: 765, expiration: "2026-08-20", qty: 1 },
    ] });
    const o = evaluarOportunidad(t, precios(3, 1), 762, 0.2, HOY);
    expect(o.estado).toBe("vencido");
    expect(o.alertar).toBe(false);
    expect(o.motivo).toMatch(/Venció/);
  });

  it("sin precios en vivo lo dice, no inventa números", () => {
    const o = evaluarOportunidad(trade(), [], 762, 0.2, HOY);
    expect(o.estado).toBe("sin_precio");
    expect(o.maxGanancia).toBeNull();
  });

  it("una oportunidad viva trae lo que pasaría si entras ahora", () => {
    const o = evaluarOportunidad(trade(), precios(3, 1), 762, 0.2, HOY);
    expect(o.estado).toBe("entrable");
    expect(o.netoAhora).toBeCloseTo(2, 5);
    expect(o.maxGanancia).toBeGreaterThan(0);
    expect(o.maxPerdida).toBeLessThan(0);
    expect(o.pop).toBeGreaterThan(0);
    expect(o.alertar).toBe(true);
  });

  it("si el movimiento ya pasó, se marca como 'ya corrió'", () => {
    const o = evaluarOportunidad(trade(), precios(5, 1.5), 770, 0.2, HOY);
    expect(o.estado).toBe("ya_corrio");
    expect(o.alertar).toBe(false);
    expect(o.motivo).toMatch(/ya pasó/);
  });

  it("avisa cuando vence hoy", () => {
    const t = trade({ legs: [
      { type: "call", side: "buy", strike: 760, expiration: HOY, qty: 1 },
      { type: "call", side: "sell", strike: 765, expiration: HOY, qty: 1 },
    ] });
    const o = evaluarOportunidad(t, precios(3, 1), 762, 0.2, HOY);
    expect(o.motivo).toMatch(/Vence HOY/);
    expect(o.dias).toBe(0);
  });
});

describe("porQueDeLaOportunidad (el razonamiento paso a paso)", () => {
  it("una vencida se explica y no sigue analizando", () => {
    const t = trade({ legs: [
      { type: "call", side: "buy", strike: 760, expiration: "2026-08-20", qty: 1 },
      { type: "call", side: "sell", strike: 765, expiration: "2026-08-20", qty: 1 },
    ] });
    const pasos = porQueDeLaOportunidad(evaluarOportunidad(t, precios(3, 1), 762, 0.2, HOY), HOY);
    expect(pasos).toHaveLength(1);
    expect(pasos[0].señal).toBe("no");
    expect(pasos[0].detalle).toMatch(/Venció el 2026-08-20/);
  });

  it("una viva explica el calendario, el precio y los números de entrar", () => {
    const pasos = porQueDeLaOportunidad(evaluarOportunidad(trade(), precios(3, 1), 762, 0.2, HOY), HOY);
    expect(pasos.map((p) => p.titulo)).toEqual(["¿Sigue viva?", "¿Se movió ya el precio?", "Si entras ahora"]);
    expect(pasos[0].detalle).toMatch(/quedan 3 días/);
    expect(pasos[2].detalle).toMatch(/Pones \$/);
  });

  it("avisa cuando vence hoy", () => {
    const t = trade({ legs: [
      { type: "call", side: "buy", strike: 760, expiration: HOY, qty: 1 },
      { type: "call", side: "sell", strike: 765, expiration: HOY, qty: 1 },
    ] });
    const pasos = porQueDeLaOportunidad(evaluarOportunidad(t, precios(3, 1), 762, 0.2, HOY), HOY);
    expect(pasos[0].señal).toBe("aviso");
    expect(pasos[0].detalle).toMatch(/vence HOY/i);
  });

  it("explica por qué una ya corrió, con los dos precios", () => {
    const pasos = porQueDeLaOportunidad(evaluarOportunidad(trade(), precios(5, 1.5), 770, 0.2, HOY), HOY);
    const p = pasos.find((x) => x.titulo === "¿Se movió ya el precio?")!;
    expect(p.señal).toBe("no");
    expect(p.detalle).toMatch(/ya pasó/);
    expect(pasos.some((x) => x.titulo === "Si entras ahora")).toBe(false);
  });

  it("un crédito que se consumió se explica como prima, no como coste", () => {
    const credito = trade({ entryNet: -2, legs: [
      { type: "put", side: "sell", strike: 760, expiration: "2026-09-05", qty: 1 },
      { type: "put", side: "buy", strike: 755, expiration: "2026-09-05", qty: 1 },
    ] });
    const o = evaluarOportunidad(credito, [
      { strike: 760, type: "put", mid: 1.2 }, { strike: 755, type: "put", mid: 0.7 },
    ], 762, 0.2, HOY);
    const p = porQueDeLaOportunidad(o, HOY).find((x) => x.titulo === "¿Se movió ya el precio?")!;
    expect(p.detalle).toMatch(/prima/i);
  });

  it("sin precios lo dice en vez de callar", () => {
    const pasos = porQueDeLaOportunidad(evaluarOportunidad(trade(), [], 762, 0.2, HOY), HOY);
    expect(pasos.some((p) => p.señal === "info" && /falta el precio/i.test(p.detalle))).toBe(true);
  });
});

describe("mejorQueAntes (no confundir mejor entrada con 'aún no se movió')", () => {
  it("en un crédito, cobrar más ahora es mejor", () => {
    expect(mejorQueAntes(-0.27, -0.60)).toBe(true);
    expect(mejorQueAntes(-0.60, -0.27)).toBe(false);
  });
  it("en un débito, pagar menos ahora es mejor", () => {
    expect(mejorQueAntes(2.0, 1.2)).toBe(true);
    expect(mejorQueAntes(1.2, 2.0)).toBe(false);
  });
  it("una prima que creció se explica como mejor entrada, no como 'no se movió'", () => {
    const credito = trade({ entryNet: -0.27, legs: [
      { type: "put", side: "sell", strike: 760, expiration: "2026-09-05", qty: 1 },
      { type: "put", side: "buy", strike: 755, expiration: "2026-09-05", qty: 1 },
    ] });
    const o = evaluarOportunidad(credito, [
      { strike: 760, type: "put", mid: 1.0 }, { strike: 755, type: "put", mid: 0.4 },
    ], 762, 0.2, HOY);
    const p = porQueDeLaOportunidad(o, HOY).find((x) => x.titulo === "¿Se movió ya el precio?")!;
    expect(p.detalle).toMatch(/a tu favor/);
    expect(p.detalle).not.toMatch(/No lo suficiente/);
  });
});
