import { describe, expect, it } from "vitest";
import {
  concentracionClientes, inventarioVsVentas, lecturaSuministro, textoPlano, type HechoXbrl,
} from "./agenteSuministro";

// Frases reales de los 10-K (SEC)
const NVDA = "Direct Customers For fiscal year 2026, sales to one direct customer represented 22% of total revenue and sales to another direct customer represented 14% of total revenue, all of which were primarily attributable to the Compute & Networking segment. For fiscal year 2025, sales to one direct customer represented 12% of total revenue and sales to two direct customers each represented 11% of total revenue, all of which were primarily attributable to the Compute & Networking segment.";
const INTC = "Collectively, our three largest customers accounted for 43% of our net revenue in 2025, 45% of our net revenue in 2024 and 40% of our net revenue in 2023.";

describe("textoPlano", () => {
  it("quita etiquetas y espacios", () => {
    expect(textoPlano("<p>Hola&nbsp;<b>mundo</b></p>\n\n x")).toBe(" Hola mundo x");
  });
});

describe("concentracionClientes", () => {
  it("NVIDIA: un cliente es el 22% (el año más reciente manda)", () => {
    const c = concentracionClientes(NVDA);
    expect(c.mayorPct).toBe(22);
    expect(c.agrupado).toBe(false);
    expect(c.frases[0]).toMatch(/^For fiscal year 2026/);
    expect(c.frases).toHaveLength(2);
  });
  it("Intel: sus tres clientes más grandes juntos son el 43% (el del año más reciente, no el mayor)", () => {
    const c = concentracionClientes(INTC);
    expect(c.agrupado).toBe(true);
    expect(c.mayorPct).toBe(43);
  });
  it("frases de % que no hablan de clientes no cuentan", () => {
    expect(concentracionClientes("Research costs were 15% of total revenue.").mayorPct).toBeNull();
  });
  it("sin nada → null", () => {
    expect(concentracionClientes("").mayorPct).toBeNull();
  });
});

const trimestre = (start: string, end: string, val: number): HechoXbrl => ({ start, end, val, form: "10-Q" });
const saldo = (end: string, val: number): HechoXbrl => ({ end, val, form: "10-Q" });

describe("inventarioVsVentas", () => {
  it("compara inventario y ventas del trimestre contra hace un año", () => {
    const r = inventarioVsVentas(
      [saldo("2025-06-30", 100), saldo("2026-06-30", 160)],
      [trimestre("2025-04-01", "2025-06-30", 1000), trimestre("2026-04-01", "2026-06-30", 1100), { start: "2025-07-01", end: "2026-06-30", val: 4000, form: "10-K" }],
    )!;
    expect(r.inventarioPct).toBeCloseTo(60, 5);
    expect(r.ventasPct).toBeCloseTo(10, 5);
    expect(r.fecha).toBe("2026-06-30");
  });
  it("sin el año anterior no inventa", () => {
    expect(inventarioVsVentas([saldo("2026-06-30", 160)], [trimestre("2026-04-01", "2026-06-30", 1100)])).toBeNull();
  });
});

describe("lecturaSuministro", () => {
  const rep = { fecha: "2026-02-25", url: "https://sec.gov/nvda-10k" };

  it("NVIDIA: depende de pocos clientes, con la frase y el enlace", () => {
    const l = lecturaSuministro({ ticker: "NVDA", concentracion: concentracionClientes(NVDA), reporteAnual: rep, inventario: null, avisos: [] });
    expect(l.senal).toBe("Depende de pocos clientes");
    expect(l.viendo).toBe("Un cliente es el 22% de las ventas.");
    expect(l.detalles.join(" ")).toContain('Lo que dice el reporte (en inglés): "For fiscal year 2026');
    expect(l.fuentes[0].url).toBe("https://sec.gov/nvda-10k");
  });

  it("sin clientes grandes reportados lo explica", () => {
    const l = lecturaSuministro({ ticker: "AAPL", concentracion: concentracionClientes("nada"), reporteAnual: rep, inventario: null, avisos: [] });
    expect(l.detalles[0]).toMatch(/solo tienen que decirlo cuando pasa del 10%/);
    expect(l.senal).toBe("Sin nada raro");
  });

  it("inventario creciendo mucho más que las ventas → posible atasco", () => {
    const l = lecturaSuministro({
      ticker: "X", concentracion: null, reporteAnual: null, avisos: [{ fecha: "2026-09-01", url: "https://sec.gov/a" }],
      inventario: { inventarioPct: 60, ventasPct: 10, fecha: "2026-06-30" },
    });
    expect(l.detalles.join(" ")).toMatch(/posible atasco/);
    expect(l.tono).toBe("down");
    expect(l.senal).toBe("Riesgo de suministro");
  });

  it("siempre dice lo que no se puede ver", () => {
    const l = lecturaSuministro({ ticker: "X", concentracion: null, reporteAnual: null, inventario: null, avisos: [] });
    expect(l.detalles.at(-1)).toMatch(/mapa real de proveedores/);
  });
});
