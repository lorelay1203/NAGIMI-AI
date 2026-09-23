import { describe, expect, it } from "vitest";
import { encabezadoImpresion, fechaArchivo, fechaLarga, tituloImpresion } from "./tituloImpresion";

// Las fechas se arman con el constructor local (año, mes-1, día) a propósito:
// con "2026-09-23" en texto JavaScript la lee en UTC y en Puerto Rico saldría
// el día 22.
const DIA = new Date(2026, 8, 23); // 23 de septiembre de 2026

describe("fechaLarga", () => {
  it("escribe la fecha en español llano", () => {
    expect(fechaLarga(DIA)).toBe("23 de septiembre de 2026");
  });

  it("el primero de enero también sale bien", () => {
    expect(fechaLarga(new Date(2026, 0, 1))).toBe("1 de enero de 2026");
  });
});

describe("fechaArchivo", () => {
  it("va al revés y con ceros delante, para que los PDF se ordenen solos", () => {
    expect(fechaArchivo(DIA)).toBe("2026-09-23");
    expect(fechaArchivo(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("tituloImpresion", () => {
  it("lleva ticker y fecha, sin acentos ni signos raros", () => {
    const t = tituloImpresion("nvda", DIA);
    expect(t).toBe("Nagimi AI - NVDA - 2026-09-23");
    expect(t).not.toMatch(/[^\x20-\x7E]/); // solo caracteres seguros para nombre de archivo
  });

  it("limpia espacios y pone mayúsculas", () => {
    expect(tituloImpresion("  spy  ", DIA)).toBe("Nagimi AI - SPY - 2026-09-23");
  });

  it("sin ticker NO inventa uno: dice 'Analisis'", () => {
    expect(tituloImpresion(null, DIA)).toBe("Nagimi AI - Analisis - 2026-09-23");
    expect(tituloImpresion("", DIA)).toBe("Nagimi AI - Analisis - 2026-09-23");
    expect(tituloImpresion("   ", DIA)).toBe("Nagimi AI - Analisis - 2026-09-23");
    expect(tituloImpresion(undefined, DIA)).toBe("Nagimi AI - Analisis - 2026-09-23");
  });

  it("fecha rota → dice 'sin fecha', no pone una fecha falsa", () => {
    expect(tituloImpresion("NVDA", new Date("cualquier cosa"))).toBe("Nagimi AI - NVDA - sin fecha");
  });
});

describe("encabezadoImpresion", () => {
  it("es la línea que se lee en el papel", () => {
    expect(encabezadoImpresion("NVDA", DIA)).toBe("Nagimi AI · NVDA · 23 de septiembre de 2026");
  });

  it("sin ticker se salta el hueco en vez de dejar separadores vacíos", () => {
    expect(encabezadoImpresion(null, DIA)).toBe("Nagimi AI · 23 de septiembre de 2026");
  });

  it("fecha rota → 'sin fecha'", () => {
    expect(encabezadoImpresion("SPY", new Date(NaN))).toBe("Nagimi AI · SPY · sin fecha");
  });
});
