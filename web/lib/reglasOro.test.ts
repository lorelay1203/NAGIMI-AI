import { describe, expect, it } from "vitest";
import { cambiosDeSigno, minutosNY, revisarReglasOro, salidaAntes, type EntradaReglas } from "./reglasOro";

// 11:30 AM en Nueva York (horario de verano, UTC−4).
const MEDIODIA = new Date("2026-10-08T15:30:00Z");

function base(over: Partial<EntradaReglas> = {}): EntradaReglas {
  return {
    ticker: "SPX", spot: 7000, fuenteGex: "marketsnack", netGex: 8e9, gammaFlip: 6900,
    magnet: 7050, callWall: 7100, putWall: 6950,
    bars: [
      { strike: 6950, netGex: -2e8 }, { strike: 6975, netGex: -1e8 }, { strike: 7000, netGex: 3e8 },
      { strike: 7025, netGex: 5e8 }, { strike: 7050, netGex: 9e8 }, { strike: 7075, netGex: 4e8 },
    ],
    direccion: "long", meta: 7050,
    contrato: { strike: 7030, type: "call", mid: 6, delta: 0.4, theta: -3, iv: 0.18, dte: 0 },
    ahora: MEDIODIA,
    ...over,
  };
}
const regla = (r: ReturnType<typeof revisarReglasOro>, id: string) => r.reglas.find((x) => x.id === id)!;

describe("reglas de oro", () => {
  it("lee la hora de Nueva York", () => {
    expect(minutosNY(MEDIODIA)).toBe(11 * 60 + 30);
  });

  it("un setup limpio en SPX sale verde", () => {
    const r = revisarReglasOro(base());
    expect(r.veredicto).toBe("verde");
    expect(regla(r, "delta").estado).toBe("ok"); // excepción 0DTE: entre el precio y la meta
    expect(regla(r, "strike").estado).toBe("ok");
    expect(regla(r, "gex_total").estado).toBe("ok");
  });

  it("primera hora: espera a las 10:30", () => {
    const r = revisarReglasOro(base({ ahora: new Date("2026-10-08T13:45:00Z") })); // 9:45 NY
    expect(regla(r, "hora").estado).toBe("ojo");
    expect(regla(r, "hora").texto).toContain("10:30");
  });

  it("GEX total casi en cero → no", () => {
    const r = revisarReglasOro(base({ netGex: 1.2e9 }));
    expect(regla(r, "gex_total").estado).toBe("no");
    expect(r.veredicto).toBe("rojo");
  });

  it("fuera de SPX no compara los billones", () => {
    const r = revisarReglasOro(base({ ticker: "SPY", spot: 700, meta: 705, magnet: 705, callWall: 710, putWall: 695, gammaFlip: 690,
      contrato: { strike: 703, type: "call", mid: 0.8, delta: 0.4, theta: null, iv: 0.2, dte: 0 }, bars: [] }));
    expect(regla(r, "gex_total").estado).toBe("sin_dato");
    expect(regla(r, "indice").estado).toBe("ojo");
  });

  it("delta menor de 0.25 se descarta", () => {
    const r = revisarReglasOro(base({ contrato: { strike: 7045, type: "call", mid: 1, delta: 0.15, theta: null, iv: 0.2, dte: 0 } }));
    expect(regla(r, "delta").estado).toBe("no");
  });

  it("strike en la meta o más allá → no", () => {
    const r = revisarReglasOro(base({ contrato: { strike: 7050, type: "call", mid: 2, delta: 0.3, theta: null, iv: 0.2, dte: 0 } }));
    expect(regla(r, "strike").estado).toBe("no");
  });

  it("theta: más de 5% al día no entra, 2% o menos bien", () => {
    const caro = revisarReglasOro(base({ contrato: { strike: 7000, type: "call", mid: 5, delta: 0.55, theta: -0.4, iv: 0.3, dte: 10 } }));
    expect(regla(caro, "theta").estado).toBe("no");
    const bien = revisarReglasOro(base({ contrato: { strike: 7000, type: "call", mid: 5, delta: 0.55, theta: -0.08, iv: 0.3, dte: 40 } }));
    expect(regla(bien, "theta").estado).toBe("ok");
  });

  it("IV: 90%+ catastrófico, 24-48% sano", () => {
    const k = { strike: 7000, type: "call" as const, mid: 5, delta: 0.55, theta: -0.05, dte: 30 };
    expect(regla(revisarReglasOro(base({ contrato: { ...k, iv: 0.95 } })), "iv").estado).toBe("no");
    expect(regla(revisarReglasOro(base({ contrato: { ...k, iv: 0.75 } })), "iv").estado).toBe("ojo");
    expect(regla(revisarReglasOro(base({ contrato: { ...k, iv: 0.30 } })), "iv").estado).toBe("ok");
  });

  it("pegado al punto de cambio → no", () => {
    const r = revisarReglasOro(base({ gammaFlip: 7005 }));
    expect(regla(r, "flip").estado).toBe("no");
  });

  it("detecta el zigzag", () => {
    const zz = [6950, 6975, 7000, 7025, 7050, 7075].map((strike, i) => ({ strike, netGex: (i % 2 ? -1 : 1) * 5e8 }));
    expect(cambiosDeSigno(zz, 7000)).toBe(5);
    expect(regla(revisarReglasOro(base({ bars: zz })), "zigzag").estado).toBe("no");
  });

  it("imán igual al muro y precio pasado del muro avisan", () => {
    const r = revisarReglasOro(base({ magnet: 7100, meta: 7100, spot: 7120, contrato: null }));
    expect(regla(r, "iman_muro").estado).toBe("ojo");
    expect(regla(r, "extremo").texto).toContain("regrese al muro");
  });

  it("sale unos puntos antes de la meta", () => {
    expect(salidaAntes(7000, 7000, "long")).toBe(6995.8);
    expect(salidaAntes(700, 700, "short")).toBe(700.42);
  });
});
