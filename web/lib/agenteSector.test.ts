import { describe, expect, it } from "vitest";
import { lecturaSector, sectorDe } from "./agenteSector";

describe("sectorDe", () => {
  it("ubica las industrias de Finnhub en su fondo de sector", () => {
    expect(sectorDe("Semiconductors")?.etf).toBe("SMH");
    expect(sectorDe("Technology")?.etf).toBe("XLK");
    expect(sectorDe("Banking")?.etf).toBe("XLF");
    expect(sectorDe("Energy")?.etf).toBe("XLE");
    expect(sectorDe("Health Care")?.etf).toBe("XLV");
    expect(sectorDe("Automobiles")?.etf).toBe("XLY");
    expect(sectorDe("Retail")?.etf).toBe("XLY");
    expect(sectorDe("Media")?.etf).toBe("XLC");
  });
  it("semiconductores no se confunde con tecnología general", () => {
    expect(sectorDe("Semiconductors")?.nombre).toBe("semiconductores");
  });
  it("lo desconocido no se inventa", () => {
    expect(sectorDe("Cosas raras")).toBeNull();
    expect(sectorDe(null)).toBeNull();
  });
});

const BASE = {
  ticker: "NVDA", sector: sectorDe("Semiconductors"), sesiones: 20,
  cambioTicker: 5, cambioSector: 8, cambioMercado: 2, fechaDatos: "2026-10-06",
};

describe("lecturaSector", () => {
  it("sector que va mucho mejor que el mercado → viento a favor", () => {
    const l = lecturaSector(BASE);
    expect(l.puntos).toBe(1);
    expect(l.resumen).toBe("su sector (semiconductores) va mejor que el mercado");
    expect(l.detalles[0]).toContain("6.0 puntos mejor que el mercado");
  });
  it("dice si el ticker va por delante o por detrás de su grupo", () => {
    expect(lecturaSector(BASE).detalles[1]).toContain("NVDA va 3.0 puntos por detrás de su propio sector");
    expect(lecturaSector({ ...BASE, cambioTicker: 12 }).detalles[1]).toContain("es de los fuertes del grupo");
  });
  it("sector que se queda atrás resta", () => {
    const l = lecturaSector({ ...BASE, cambioSector: -3 });
    expect(l.puntos).toBe(-1);
    expect(l.detalles[0]).toMatch(/el dinero está saliendo/i);
  });
  it("parejo no suma ni resta", () => {
    expect(lecturaSector({ ...BASE, cambioSector: 2.5 }).puntos).toBe(0);
  });
  it("siempre pone la fecha de los datos", () => {
    expect(lecturaSector(BASE).detalles.at(-1)).toBe("Datos hasta el cierre del 6 oct 2026.");
  });
  it("sin sector lo dice", () => {
    const l = lecturaSector({ ...BASE, sector: null });
    expect(l.detalles[0]).toMatch(/No se pudo ubicar el sector/);
    expect(l.resumen).toBeNull();
  });
  it("SPY no es un sector: lo dice así", () => {
    expect(lecturaSector({ ...BASE, ticker: "SPY", sector: null }).detalles[0]).toMatch(/fondo del mercado completo/);
  });
  it("un fondo de sector no se compara consigo mismo", () => {
    const l = lecturaSector({ ...BASE, ticker: "SMH" });
    expect(l.detalles.some((d) => d.includes("propio sector"))).toBe(false);
  });
});
