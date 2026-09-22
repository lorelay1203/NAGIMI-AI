import { describe, expect, it, vi } from "vitest";
import { cachedDailyBars, type BarsFile } from "./barsStore";
import { marketDateStr } from "./occ";
import type { DailyBar } from "./types";

const NOW = new Date("2026-09-15T15:00:00Z");
const HOY = marketDateStr(NOW);
const barra = (time: string, close: number): DailyBar => ({ time, open: close, high: close, low: close, close });
const AYER: BarsFile = { ticker: "NVDA", date: "2026-09-14", bars: [barra("2026-09-14", 210)] };
const FRESCAS = [barra("2026-09-14", 210), barra("2026-09-15", 212)];

describe("cachedDailyBars", () => {
  it("si ya hay barras de hoy guardadas, no le pide nada a Massive", async () => {
    const fetch = vi.fn();
    const bars = await cachedDailyBars("NVDA", 365, NOW, {
      fetch, load: async () => ({ ticker: "NVDA", date: HOY, bars: FRESCAS }), save: async () => {},
    });
    expect(bars).toEqual(FRESCAS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("si Massive devuelve vacío, reintenta y guarda cuando responde (caso del panel pegado)", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(FRESCAS);
    const save = vi.fn(async () => {});
    const bars = await cachedDailyBars("NVDA", 365, NOW, { fetch, load: async () => null, save, pausaMs: 0 });
    expect(bars).toEqual(FRESCAS);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenCalledOnce();
  });

  it("un error de red cuenta como intento fallido, no revienta", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(FRESCAS);
    const bars = await cachedDailyBars("NVDA", 365, NOW, { fetch, load: async () => null, save: async () => {}, pausaMs: 0 });
    expect(bars).toEqual(FRESCAS);
  });

  it("si Massive nunca responde, usa las velas de ayer en vez de una lista vacía", async () => {
    const fetch = vi.fn().mockResolvedValue([]);
    const bars = await cachedDailyBars("NVDA", 365, NOW, { fetch, load: async () => AYER, save: async () => {}, pausaMs: 0 });
    expect(bars).toEqual(AYER.bars);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("sin nada guardado y sin respuesta, devuelve vacío (no inventa)", async () => {
    const bars = await cachedDailyBars("XYZ", 365, NOW, {
      fetch: async () => [], load: async () => null, save: async () => {}, pausaMs: 0,
    });
    expect(bars).toEqual([]);
  });

  it("si falla guardar en disco, igual devuelve las barras", async () => {
    const bars = await cachedDailyBars("NVDA", 365, NOW, {
      fetch: async () => FRESCAS, load: async () => null, save: async () => { throw new Error("disco lleno"); }, pausaMs: 0,
    });
    expect(bars).toEqual(FRESCAS);
  });
});
