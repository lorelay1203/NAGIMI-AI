import { describe, expect, it } from "vitest";
import { buildEvolucion, diasEntre } from "./tesisTimeline";
import type { PredictionSnapshot } from "./predictionStore";

function snap(o: Partial<PredictionSnapshot> & { date: string }): PredictionSnapshot {
  return {
    savedAt: `${o.date}T14:00:00.000Z`,
    spot: 100, horizonDays: 20, bear: 90, base: 100, bull: 110,
    direction: "flat", confidence: 55, ...o,
  };
}

describe("diasEntre", () => {
  it("cuenta días de calendario", () => {
    expect(diasEntre("2026-09-04", "2026-09-10")).toBe(6);
  });
  it("mismo día = 0, y nunca negativo", () => {
    expect(diasEntre("2026-09-10", "2026-09-10")).toBe(0);
    expect(diasEntre("2026-09-10", "2026-09-04")).toBe(0);
  });
});

describe("buildEvolucion", () => {
  it("sin fotos no inventa nada", () => {
    expect(buildEvolucion([])).toEqual({ puntos: [], narracion: null });
  });

  it("una sola foto: hay punto pero no narración (nada con qué comparar)", () => {
    const r = buildEvolucion([snap({ date: "2026-09-10", direction: "up", base: 225 })]);
    expect(r.puntos).toHaveLength(1);
    expect(r.narracion).toBeNull();
  });

  it("ordena de la más vieja a la más nueva, sin importar el orden de entrada", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-10" }),
      snap({ date: "2026-08-11" }),
      snap({ date: "2026-09-08" }),
    ]);
    expect(r.puntos.map((p) => p.fecha)).toEqual(["2026-08-11", "2026-09-08", "2026-09-10"]);
  });

  it("una foto por día: se queda con la última guardada de esa fecha", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-08", base: 230, confidence: 57 }),
      snap({ date: "2026-09-08", base: 229, confidence: 60 }), // misma fecha, gana esta
    ]);
    expect(r.puntos).toHaveLength(1);
    expect(r.puntos[0].base).toBe(229);
  });

  it("de neutral a alcista → 'se puso más optimista'", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-04", direction: "flat", base: 231 }),
      snap({ date: "2026-09-10", direction: "up", base: 225 }),
    ]);
    expect(r.narracion).toContain("hace 6 días");
    expect(r.narracion).toContain("neutral");
    expect(r.narracion).toContain("alcista");
    expect(r.narracion).toContain("más optimista");
  });

  it("de alcista a bajista → 'se puso más cauteloso'", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-01", direction: "up", base: 240 }),
      snap({ date: "2026-09-10", direction: "down", base: 200 }),
    ]);
    expect(r.narracion).toContain("más cauteloso");
  });

  it("misma dirección pero salto de confianza → lo dice", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-08", direction: "up", base: 100, confidence: 45 }),
      snap({ date: "2026-09-10", direction: "up", base: 100, confidence: 70 }),
    ]);
    expect(r.narracion).toContain("más confianza");
  });

  it("misma dirección y confianza pareja → 'mantiene prácticamente la misma lectura'", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-08", direction: "flat", base: 100, confidence: 55 }),
      snap({ date: "2026-09-10", direction: "flat", base: 100, confidence: 58 }),
    ]);
    expect(r.narracion).toContain("misma lectura");
  });

  it("recorta a las últimas `max` fotos", () => {
    const muchas = Array.from({ length: 12 }, (_, i) =>
      snap({ date: `2026-08-${String(10 + i).padStart(2, "0")}` }),
    );
    const r = buildEvolucion(muchas, 6);
    expect(r.puntos).toHaveLength(6);
    expect(r.puntos[r.puntos.length - 1].fecha).toBe("2026-08-21"); // la más nueva
  });

  it("caso real NVDA: 11 ago neutral $220 → 10 sep alcista $225", () => {
    const r = buildEvolucion([
      snap({ date: "2026-09-10", direction: "up", base: 225, confidence: 51 }),
      snap({ date: "2026-09-08", direction: "flat", base: 230, confidence: 57 }),
      snap({ date: "2026-08-11", direction: "flat", base: 220, confidence: 61 }),
    ]);
    expect(r.puntos).toHaveLength(3);
    expect(r.puntos[0].fecha).toBe("2026-08-11");
    expect(r.narracion).toContain("más optimista"); // flat → up
  });
});
