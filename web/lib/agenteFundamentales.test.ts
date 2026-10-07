import { describe, expect, it } from "vitest";
import {
  comparaPrecio, lecturaFundamentales, mediana, medianaPares, metricasDeFinnhub, type Metricas,
} from "./agenteFundamentales";

// Números reales de Intel (Finnhub, 4-oct-2026)
const INTC_FINNHUB = {
  metric: {
    psTTM: 11.0603, peTTM: null, peExclExtraTTM: null, forwardPE: 63.01586,
    revenueGrowthTTMYoy: 7.47, revenueGrowthQuarterlyYoy: 25.42,
    operatingMarginTTM: 9.36, netProfitMarginTTM: -19.79,
    "totalDebt/totalEquityQuarterly": 0.5773, currentRatioQuarterly: 1.604,
  },
  series: { quarterly: { eps: [{ period: "2026-06-27", v: -2.16 }] } },
};

function m(o: Partial<Metricas> = {}): Metricas {
  return {
    ticker: "X", psTTM: 5, peTTM: 20, forwardPE: 18, crecVentasAnual: 12, crecVentasTrimestre: 10,
    margenOperativo: 25, margenNeto: 18, deudaPatrimonio: 0.4, liquidezCorriente: 2, trimestre: "2026-06-30", ...o,
  };
}

describe("metricasDeFinnhub", () => {
  it("lee las métricas de Intel", () => {
    const x = metricasDeFinnhub("INTC", INTC_FINNHUB)!;
    expect(x.psTTM).toBeCloseTo(11.06, 2);
    expect(x.peTTM).toBeNull();          // perdió dinero: no hay precio/ganancia
    expect(x.forwardPE).toBeCloseTo(63.0, 1);
    expect(x.margenNeto).toBeCloseTo(-19.79, 2);
    expect(x.trimestre).toBe("2026-06-27");
  });
  it("sin métricas → null", () => {
    expect(metricasDeFinnhub("X", null)).toBeNull();
    expect(metricasDeFinnhub("X", {})).toBeNull();
  });
});

describe("mediana y pares", () => {
  it("ignora los que no tienen dato", () => {
    expect(mediana([3, null, 1, 2])).toBe(2);
    expect(mediana([null])).toBeNull();
  });
  it("mediana del grupo", () => {
    const p = medianaPares([m({ ticker: "A", psTTM: 4 }), m({ ticker: "B", psTTM: 6 }), m({ ticker: "C", psTTM: 100 })]);
    expect(p.psTTM).toBe(6);              // la mediana no se deja llevar por el extremo
    expect(p.tickers).toEqual(["A", "B", "C"]);
  });
});

describe("comparaPrecio", () => {
  it("25% más que el grupo es cara; 20% menos es barata", () => {
    expect(comparaPrecio(12.5, 10)).toBe("cara");
    expect(comparaPrecio(8, 10)).toBe("barata");
    expect(comparaPrecio(10.5, 10)).toBe("parecida");
    expect(comparaPrecio(10, null)).toBeNull();
  });
});

describe("lecturaFundamentales", () => {
  it("Intel: perdió dinero, cara contra su grupo, y lo explica", () => {
    const x = metricasDeFinnhub("INTC", INTC_FINNHUB)!;
    const l = lecturaFundamentales(x, medianaPares([m({ ticker: "AMD", psTTM: 6 }), m({ ticker: "TXN", psTTM: 7 })]));
    const todo = l.detalles.join(" ");
    expect(todo).toContain("PERDIÓ dinero");
    expect(todo).toContain("su negocio principal sí deja $9 de cada $100");
    expect(todo).toContain("Está más cara que su grupo");
    expect(todo).toContain("ESTIMADO por analistas, no un hecho");
    expect(todo).toContain("trimestre del 27 jun 2026");
    expect(l.tono).toBe("down");
    expect(l.senal).toBe("Floja y cara");
  });

  it("Intel real: barata por ventas pero cara por ganancia futura → lo dice como mixto", () => {
    const x = metricasDeFinnhub("INTC", INTC_FINNHUB)!;
    const l = lecturaFundamentales(x, medianaPares([m({ ticker: "AMD", psTTM: 16.6, forwardPE: 21.8 })]));
    expect(l.senal).toBe("Números flojos");
    expect(l.viendo).toContain("más barata por ventas pero más cara por ganancia futura");
  });

  it("NVIDIA real: sólida; cara por ventas pero barata por ganancia futura → precio mixto", () => {
    const l = lecturaFundamentales(m({ crecVentasAnual: 83.4, margenNeto: 64, psTTM: 18.6, forwardPE: 17 }),
      medianaPares([m({ psTTM: 14.2, forwardPE: 25.9 })]));
    expect(l.senal).toBe("Empresa sólida");
    expect(l.viendo).toContain("más cara por ventas pero más barata por ganancia futura");
  });

  it("sólida y cara por los dos lados → 'Sólida, pero cara'", () => {
    const l = lecturaFundamentales(m({ crecVentasAnual: 40, margenNeto: 30, psTTM: 20, forwardPE: 40 }),
      medianaPares([m({ psTTM: 10, forwardPE: 20 })]));
    expect(l.senal).toBe("Sólida, pero cara");
  });

  it("competidores que pierden dinero se dicen en palabras", () => {
    const l = lecturaFundamentales(m(), medianaPares([m({ margenOperativo: -4 })]));
    expect(l.detalles.join(" ")).toContain("Sus competidores pierden $4");
  });

  it("empresa que crece, gana mucho y está barata → sólida", () => {
    const l = lecturaFundamentales(m({ crecVentasAnual: 30, margenNeto: 25, psTTM: 3 }), medianaPares([m({ psTTM: 6 }), m({ psTTM: 7 })]));
    expect(l.senal).toBe("Sólida y barata");
    expect(l.tono).toBe("up");
  });

  it("mucha deuda y poca plata para pagar este año → lo avisa", () => {
    const l = lecturaFundamentales(m({ deudaPatrimonio: 3, liquidezCorriente: 0.7 }), null);
    expect(l.detalles.join(" ")).toMatch(/mucha deuda/);
    expect(l.detalles.join(" ")).toMatch(/⚠ Tiene solo \$0.70/);
  });

  it("siempre recuerda que pesa a mediano plazo, no en un contrato de hoy", () => {
    expect(lecturaFundamentales(m(), null).empuje).toMatch(/mediano plazo/);
  });

  it("no usa siglas de finanzas", () => {
    const x = metricasDeFinnhub("INTC", INTC_FINNHUB)!;
    const l = lecturaFundamentales(x, medianaPares([m()]));
    const todo = [l.viendo, l.empuje, ...l.detalles].join(" ");
    for (const s of ["P/E", "P/S", "EPS", "TTM", "YoY", "DCF"]) expect(todo).not.toContain(s);
  });
});
