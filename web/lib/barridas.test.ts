import { describe, expect, it } from "vitest";
import { contarBarridas, fraseBarridas, type FilaFlujo } from "./barridas";

// 11:00 AM de Nueva York del 25 de septiembre de 2026
const AHORA = new Date("2026-09-25T15:00:00Z");
const C = { type: "call" as const, strike: 7660, expiration: "2026-09-25" };

function fila(o: Partial<FilaFlujo> = {}): FilaFlujo {
  return {
    type: "call", strike: 7660, expiration: "2026-09-25", aggression: "ask",
    conditionCode: "ISOI", premium: 50_000, timestamp: "2026-09-25T14:10:00Z", ...o,
  };
}

describe("contarBarridas", () => {
  it("cuenta las barridas comprando el mismo contrato hoy", () => {
    const b = contarBarridas([fila(), fila(), fila({ premium: 20_000 })], C, AHORA);
    expect(b).toEqual({ compras: 3, ventas: 0, primaCompras: 120_000, primaVentas: 0 });
  });

  it("ignora lo que no es barrida", () => {
    expect(contarBarridas([fila({ conditionCode: "SLAN" }), fila({ conditionCode: null })], C, AHORA).compras).toBe(0);
  });

  it("ignora otro precio pactado, otro tipo u otra fecha", () => {
    const b = contarBarridas([
      fila({ strike: 7665 }), fila({ type: "put" }), fila({ expiration: "2026-09-26" }),
    ], C, AHORA);
    expect(b.compras + b.ventas).toBe(0);
  });

  it("ignora las de ayer (por el día de Nueva York)", () => {
    // 01:00 UTC del 25 = 9 PM del 24 en Nueva York
    expect(contarBarridas([fila({ timestamp: "2026-09-25T01:00:00Z" })], C, AHORA).compras).toBe(0);
  });

  it("separa compras de ventas; las del medio no cuentan para ningún lado", () => {
    const b = contarBarridas([fila(), fila({ aggression: "bid", premium: 90_000 }), fila({ aggression: "mid" })], C, AHORA);
    expect(b).toEqual({ compras: 1, ventas: 1, primaCompras: 50_000, primaVentas: 90_000 });
  });
});

describe("fraseBarridas", () => {
  it("sin barridas no dice nada", () => {
    expect(fraseBarridas(null)).toBeNull();
    expect(fraseBarridas({ compras: 0, ventas: 0, primaCompras: 0, primaVentas: 0 })).toBeNull();
  });
  it("solo compras: buena señal", () => {
    expect(fraseBarridas({ compras: 3, ventas: 0, primaCompras: 1, primaVentas: 0 }))
      .toEqual({ texto: "✓ 3 barridas comprando este contrato hoy", tono: "bien" });
  });
  it("una sola en singular", () => {
    expect(fraseBarridas({ compras: 1, ventas: 0, primaCompras: 1, primaVentas: 0 })?.texto)
      .toBe("✓ 1 barrida comprando este contrato hoy");
  });
  it("solo ventas: avisa que apuestan en contra", () => {
    const f = fraseBarridas({ compras: 0, ventas: 2, primaCompras: 0, primaVentas: 1 });
    expect(f?.tono).toBe("mal");
    expect(f?.texto).toMatch(/en contra/);
  });
  it("mezcla: dice qué lado pone más dinero", () => {
    const f = fraseBarridas({ compras: 1, ventas: 2, primaCompras: 10, primaVentas: 99 });
    expect(f?.texto).toMatch(/más dinero vendiendo/);
    expect(f?.tono).toBe("aviso");
  });
});
