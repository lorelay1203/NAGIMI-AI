import { describe, expect, it } from "vitest";
import { aSemanales, lecturaMarcos, marcos, tendenciaDe, type VelaFecha } from "./agenteMarcos";

/** Velas diarias de lunes a viernes empezando el lunes 5-ene-2026, con un cierre por día. */
function diarias(cierres: number[]): VelaFecha[] {
  const out: VelaFecha[] = [];
  const d = new Date("2026-01-05T12:00:00Z");
  for (const c of cierres) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    out.push({ time: d.toISOString().slice(0, 10), close: c });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const sube = (n: number, desde = 100) => Array.from({ length: n }, (_, i) => desde * (1 + i * 0.004));
const baja = (n: number, desde = 100) => Array.from({ length: n }, (_, i) => desde * (1 - i * 0.003));
const plano = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 2 ? 0.1 : -0.1));

describe("aSemanales", () => {
  it("junta 10 días hábiles en 2 semanas, con el último cierre de cada una", () => {
    expect(aSemanales(diarias([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toEqual([5, 10]);
  });
  it("acepta velas con tiempo unix", () => {
    expect(aSemanales([{ time: Date.UTC(2026, 0, 5, 15) / 1000, close: 7 }])).toEqual([7]);
  });
});

describe("tendenciaDe", () => {
  it("sube, baja o va de lado", () => {
    expect(tendenciaDe(sube(80), 20, 50)).toBe("arriba");
    expect(tendenciaDe(baja(80), 20, 50)).toBe("abajo");
    expect(tendenciaDe(plano(80), 20, 50)).toBe("lateral");
  });
  it("sin velas suficientes no inventa", () => {
    expect(tendenciaDe(sube(30), 20, 50)).toBeNull();
  });
});

describe("marcos + lecturaMarcos", () => {
  it("los tres para arriba → coinciden, tendencia firme", () => {
    const m = marcos(diarias(sube(200)), diarias(sube(80)));
    expect(m).toEqual({ semanal: "arriba", diario: "arriba", hora: "arriba" });
    const l = lecturaMarcos(m);
    expect(l.acuerdo).toBe("coinciden");
    expect(l.consejo).toMatch(/firme en todas las escalas/);
    expect(l.linea).toBe("Marcos de tiempo: semanal para arriba · diario para arriba · por hora para arriba.");
  });

  it("fondo para arriba pero estos días para abajo → chocan, y explica las dos posibilidades", () => {
    const l = lecturaMarcos({ semanal: "arriba", diario: "arriba", hora: "abajo" });
    expect(l.acuerdo).toBe("chocan");
    expect(l.consejo).toMatch(/respiro dentro de la tendencia grande/);
  });

  it("de lado y para arriba, sin nada para abajo → parcial", () => {
    expect(lecturaMarcos({ semanal: "arriba", diario: "lateral", hora: "arriba" }).acuerdo).toBe("parcial");
  });

  it("sin velas → lo dice", () => {
    expect(lecturaMarcos({ semanal: null, diario: null, hora: null }).acuerdo).toBe("sin datos");
  });

  it("marca el que no tuvo datos", () => {
    expect(lecturaMarcos({ semanal: null, diario: "abajo", hora: "abajo" }).linea).toContain("semanal sin datos");
  });
});
