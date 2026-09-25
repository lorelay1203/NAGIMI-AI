import { describe, expect, it } from "vitest";
import { atrPct, ema, lecturaTecnica, rsi, type VelaTecnica } from "./agenteTecnico";

/** Serie de velas a partir de cierres, con rango diario de ±0.5%. */
const velas = (cierres: number[]): VelaTecnica[] =>
  cierres.map((c) => ({ high: c * 1.005, low: c * 0.995, close: c }));

const subiendo = Array.from({ length: 80 }, (_, i) => 100 + i);          // +1 por sesión
const bajando = Array.from({ length: 80 }, (_, i) => 200 - i);
const plano = Array.from({ length: 80 }, (_, i) => 100 + (i % 2 === 0 ? 0.05 : -0.05));

describe("ema", () => {
  it("con serie plana da el mismo valor", () => {
    expect(ema(Array(60).fill(50), 20)).toBeCloseTo(50, 6);
  });
  it("sin velas suficientes no inventa", () => {
    expect(ema([1, 2, 3], 20)).toBeNull();
  });
});

describe("rsi", () => {
  it("todo subiendo → 100", () => {
    expect(rsi(subiendo)).toBe(100);
  });
  it("todo bajando → cerca de 0", () => {
    expect(rsi(bajando)!).toBeLessThan(5);
  });
  it("sin velas suficientes no inventa", () => {
    expect(rsi([1, 2, 3])).toBeNull();
  });
});

describe("atrPct", () => {
  it("mide el rango diario en % del precio", () => {
    // Rango de 1% por vela, sin huecos: el ATR debe rondar el 1%.
    const a = atrPct(velas(Array(40).fill(100)))!;
    expect(a).toBeGreaterThan(0.8);
    expect(a).toBeLessThan(1.2);
  });
});

describe("lecturaTecnica", () => {
  it("tendencia arriba: lo dice y usa el suelo como invalidación", () => {
    const l = lecturaTecnica({ velas: velas(subiendo), suelo: 150, techo: 190 })!;
    expect(l.senal).toBe("Tendencia ARRIBA");
    expect(l.tono).toBe("up");
    expect(l.invalidacion).toBe(150);
    expect(l.empuje).toContain("deja de valer");
  });

  it("tendencia abajo: usa el techo como invalidación", () => {
    const l = lecturaTecnica({ velas: velas(bajando), suelo: 110, techo: 140 })!;
    expect(l.senal).toBe("Tendencia ABAJO");
    expect(l.invalidacion).toBe(140);
  });

  it("medias pegadas: dice que no hay tendencia y avisa del stop", () => {
    const l = lecturaTecnica({ velas: velas(plano), suelo: 95, techo: 105 })!;
    expect(l.senal).toBe("Sin tendencia");
    expect(l.tono).toBe("neutral");
    expect(l.invalidacion).toBeNull();
    expect(l.empuje).toContain("stop");
  });

  it("sin muro al otro lado lo dice en vez de callarse", () => {
    const l = lecturaTecnica({ velas: velas(subiendo), suelo: null, techo: null })!;
    expect(l.invalidacion).toBeNull();
    expect(l.empuje).toContain("no hay un punto limpio");
  });

  it("con pocas velas no devuelve nada", () => {
    expect(lecturaTecnica({ velas: velas([1, 2, 3]), suelo: null, techo: null })).toBeNull();
  });

  it("dice el termómetro de estirón (RSI) y el movimiento diario en la línea de 'viendo'", () => {
    const l = lecturaTecnica({ velas: velas(subiendo), suelo: 150, techo: 190 })!;
    expect(l.viendo).toContain("termómetro de estirón");
    expect(l.viendo).toContain("Un día normal se mueve");
  });
});
