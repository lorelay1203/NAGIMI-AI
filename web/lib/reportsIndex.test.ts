import { describe, expect, it } from "vitest";
import { buildReportsIndex, listReportTickers } from "./reportsIndex";
import type { EvalBar } from "./predictionStore";

// La bitácora lee data/predictions/ del proyecto real. Estas pruebas no tocan
// esos ficheros: comprueban la parte que se puede romper sin que nadie lo note
// — el ponderado del acierto y qué pasa cuando no hay barras que medir.

const sinBarras = async (): Promise<EvalBar[]> => [];
/** Sin pausas: las esperas reales solo sirven para no saturar la red. */
const RAPIDO = { pausaMs: 0 };

describe("buildReportsIndex", () => {
  it("sin barras, ningún ticker se puntúa y no hay acierto global inventado", async () => {
    const idx = await buildReportsIndex(sinBarras, RAPIDO);
    expect(idx.filas.length).toBeGreaterThan(0); // hay bitácora real en el repo
    for (const f of idx.filas) {
      expect(f.sinDatos).toBe(true);
      expect(f.vencidas).toBe(0);
    }
    expect(idx.aciertoGlobal).toBeNull();
  });

  it("cuenta todos los reportes guardados, no solo los medibles", async () => {
    const idx = await buildReportsIndex(sinBarras, RAPIDO);
    const suma = idx.filas.reduce((s, f) => s + f.total, 0);
    expect(idx.totalReportes).toBe(suma);
    expect(idx.totalReportes).toBeGreaterThanOrEqual(idx.filas.length);
  });

  it("ordena por la foto más reciente primero", async () => {
    const idx = await buildReportsIndex(sinBarras, RAPIDO);
    const fechas = idx.filas.map((f) => f.ultimaFecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it("un ticker que falla no tumba a los demás", async () => {
    const tickers = await listReportTickers();
    const malo = tickers[0];
    const idx = await buildReportsIndex(async (t) => {
      if (t === malo) throw new Error("red caída");
      return [];
    }, RAPIDO);
    expect(idx.filas.find((f) => f.ticker === malo)?.sinDatos).toBe(true);
    expect(idx.filas.length).toBe(
      (await buildReportsIndex(sinBarras, RAPIDO)).filas.length,
    );
  });

  it("reintenta una vez cuando las barras vienen vacías", async () => {
    const intentos = new Map<string, number>();
    await buildReportsIndex(async (t) => {
      intentos.set(t, (intentos.get(t) ?? 0) + 1);
      return []; // siempre vacío → siempre debería reintentar
    }, RAPIDO);
    for (const n of intentos.values()) expect(n).toBe(2);
  });

  it("no reintenta cuando el primer intento ya trae barras", async () => {
    const intentos = new Map<string, number>();
    await buildReportsIndex(async (t) => {
      intentos.set(t, (intentos.get(t) ?? 0) + 1);
      return [{ time: "2026-01-02", high: 10, low: 9, close: 9.5 }];
    }, RAPIDO);
    for (const n of intentos.values()) expect(n).toBe(1);
  });
});
