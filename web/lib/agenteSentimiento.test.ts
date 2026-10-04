import { describe, expect, it } from "vitest";
import {
  fiabilidadFuente, lecturaSentimiento, tonoAnalistas, tonoNoticias,
  type MesAnalistas, type Titular,
} from "./agenteSentimiento";

const AHORA = new Date("2026-10-04T15:00:00Z");

describe("fiabilidadFuente", () => {
  it("agencias y diarios: alta", () => {
    expect(fiabilidadFuente("Reuters").nivel).toBe("alta");
    expect(fiabilidadFuente("The Wall Street Journal").nivel).toBe("alta");
  });
  it("comunicados de la empresa: media, y dice por qué", () => {
    const f = fiabilidadFuente("GlobeNewswire Inc.");
    expect(f.nivel).toBe("media");
    expect(f.porQue).toMatch(/su versión/);
  });
  it("sitios de recomendaciones: baja", () => {
    expect(fiabilidadFuente("The Motley Fool").nivel).toBe("baja");
    expect(fiabilidadFuente("Zacks Investment Research").nivel).toBe("baja");
  });
  it("una fuente desconocida no se trata como seria", () => {
    expect(fiabilidadFuente("Blog de Pepe").peso).toBeLessThan(1);
    expect(fiabilidadFuente(null).nivel).toBe("media");
  });
});

function t(o: Partial<Titular> = {}): Titular {
  return { publisher: "Reuters", publishedUtc: "2026-10-04T12:00:00Z", sentiment: "positive", ...o };
}

describe("tonoNoticias", () => {
  it("un titular serio en contra pesa más que dos de recomendaciones a favor", () => {
    const r = tonoNoticias([
      t({ sentiment: "negative" }),
      t({ publisher: "The Motley Fool" }), t({ publisher: "Zacks" }),
    ], AHORA)!;
    expect(r.score).toBeLessThan(0);
    expect(r.aFavor).toBe(2);
    expect(r.enContra).toBe(1);
  });
  it("lo viejo pesa menos que lo fresco", () => {
    const r = tonoNoticias([
      t({ sentiment: "negative", publishedUtc: "2026-09-24T12:00:00Z" }),
      t({ sentiment: "positive" }),
    ], AHORA)!;
    expect(r.score).toBeGreaterThan(0.5);
  });
  it("mide cuánto del peso viene de fuentes flojas", () => {
    const r = tonoNoticias([t({ publisher: "The Motley Fool" }), t({ publisher: "Zacks" }), t({ publisher: "Zacks" })], AHORA)!;
    expect(r.pesoFlojo).toBeCloseTo(1, 5);
    expect(r.porNivel).toEqual({ alta: 0, media: 0, baja: 3 });
  });
  it("dice cuántas horas tiene el titular más reciente", () => {
    expect(tonoNoticias([t()], AHORA)!.horasUltimo).toBeCloseTo(3, 5);
  });
  it("sin titulares no hay tono", () => {
    expect(tonoNoticias([], AHORA)).toBeNull();
  });
});

function mes(period: string, sb: number, b: number, h: number, s: number, ss = 0): MesAnalistas {
  return { period, strongBuy: sb, buy: b, hold: h, sell: s, strongSell: ss };
}

describe("tonoAnalistas", () => {
  // Datos reales de Intel (Finnhub, sep-2026)
  const INTC = [mes("2026-09-01", 4, 15, 34, 2), mes("2026-08-01", 4, 15, 33, 3), mes("2026-07-01", 5, 13, 34, 3), mes("2026-06-01", 4, 13, 32, 4)];

  it("Intel: ~35% dice comprar, casi nadie vender", () => {
    const a = tonoAnalistas(INTC)!;
    expect(a.total).toBe(55);
    expect(a.pctCompra).toBeCloseTo(34.5, 0);
    expect(a.pctVenta).toBeCloseTo(3.6, 0);
    expect(a.mes).toBe("2026-09-01");
  });
  it("compara con hace 3 meses", () => {
    expect(tonoAnalistas(INTC)!.cambio3m).toBeCloseTo(34.5 - 32.1, 0);
  });
  it("sin historia no inventa el cambio", () => {
    expect(tonoAnalistas([mes("2026-09-01", 1, 1, 1, 0)])!.cambio3m).toBeNull();
  });
  it("vacío → null", () => {
    expect(tonoAnalistas([])).toBeNull();
  });
});

describe("lecturaSentimiento", () => {
  it("avisa cuando casi todo viene de sitios de recomendaciones", () => {
    const l = lecturaSentimiento({
      ticker: "NVDA",
      noticias: tonoNoticias([t({ publisher: "The Motley Fool" }), t({ publisher: "Zacks" })], AHORA),
      analistas: null,
    })!;
    expect(l.detalles.join(" ")).toMatch(/Toma este tono con pinzas/);
    expect(l.viendo).toMatch(/fuentes flojas/);
  });

  it("noticias a favor y analistas a favor → 'Sentimiento a favor'", () => {
    const l = lecturaSentimiento({
      ticker: "X",
      noticias: tonoNoticias([t(), t()], AHORA),
      analistas: tonoAnalistas([mes("2026-09-01", 20, 30, 10, 0)]),
    })!;
    expect(l.senal).toBe("Sentimiento a favor");
    expect(l.tono).toBe("up");
  });

  it("si chocan, lo dice y manda a mirar el flujo", () => {
    const l = lecturaSentimiento({
      ticker: "X",
      noticias: tonoNoticias([t({ sentiment: "negative" }), t({ sentiment: "negative" })], AHORA),
      analistas: tonoAnalistas([mes("2026-09-01", 20, 30, 10, 0)]),
    })!;
    expect(l.senal).toBe("Noticias y analistas chocan");
    expect(l.empuje).toMatch(/flujo/);
  });

  it("explica si los analistas se están animando o enfriando", () => {
    const l = lecturaSentimiento({
      ticker: "X", noticias: null,
      analistas: tonoAnalistas([mes("2026-09-01", 10, 10, 5, 0), mes("2026-08-01", 5, 5, 15, 0), mes("2026-07-01", 5, 5, 15, 0), mes("2026-06-01", 5, 5, 15, 0)]),
    })!;
    expect(l.detalles.join(" ")).toMatch(/se están animando/);
    expect(l.viendo).toMatch(/y subiendo/);
  });

  it("noticias flojas y viejas solas no alcanzan para decir 'a favor'", () => {
    const l = lecturaSentimiento({
      ticker: "SPY", analistas: null,
      noticias: tonoNoticias([t({ publisher: "The Motley Fool", publishedUtc: "2026-09-19T12:00:00Z" })], AHORA),
    })!;
    expect(l.senal).toBe("Sentimiento neutral");
    expect(l.viendo).toMatch(/fuentes flojas\) y viejas/);
  });

  it("10 de 12 de sitios de recomendaciones también avisa, aunque los otros 2 pesen más", () => {
    const tit = [
      ...Array.from({ length: 10 }, () => t({ publisher: "Zacks", publishedUtc: "2026-10-01T12:00:00Z" })),
      t({ publisher: "GlobeNewswire" }), t({ publisher: "GlobeNewswire" }),
    ];
    const l = lecturaSentimiento({ ticker: "INTC", noticias: tonoNoticias(tit, AHORA), analistas: null })!;
    expect(l.detalles.join(" ")).toMatch(/con pinzas/);
  });

  it("sin nada → null", () => {
    expect(lecturaSentimiento({ ticker: "X", noticias: null, analistas: null })).toBeNull();
  });
});
