import { describe, expect, it } from "vitest";
import {
  betaContra, confianza, escenarioBaja, lecturaRiesgo, liquidezCadena,
  type FilaCadena, type Vela,
} from "./agenteRiesgo";
import type { GammaSkew } from "./gammaSkew";

function fila(o: Partial<FilaCadena> = {}): FilaCadena {
  return { strike: 100, bid: 1.0, ask: 1.02, volume: 1000, oi: 2000, ...o };
}

describe("liquidezCadena", () => {
  it("buena: diferencia chica y muchos contratos abiertos cerca del precio", () => {
    const l = liquidezCadena([fila({ strike: 99 }), fila({ strike: 100 }), fila({ strike: 101 })], 100)!;
    expect(l.nivel).toBe("buena");
    expect(l.spreadMedianoPct).toBeCloseTo(1.98, 1);
    expect(l.contratosAbiertos).toBe(6000);
  });
  it("mala: diferencia grande", () => {
    expect(liquidezCadena([fila({ bid: 1, ask: 1.4 })], 100)!.nivel).toBe("mala");
  });
  it("mala: casi nadie tiene contratos abiertos", () => {
    expect(liquidezCadena([fila({ oi: 100 })], 100)!.nivel).toBe("mala");
  });
  it("regular: en el medio", () => {
    expect(liquidezCadena([fila({ bid: 1, ask: 1.06, oi: 3000 })], 100)!.nivel).toBe("regular");
  });
  it("solo mira cerca del precio (±3%)", () => {
    const l = liquidezCadena([fila({ strike: 100 }), fila({ strike: 150, bid: 0.01, ask: 5, oi: 0 })], 100)!;
    expect(l.mirados).toBe(1);
    expect(l.nivel).toBe("regular"); // 2,000 abiertos: menos de 5,000
  });
  it("sin precios no inventa", () => {
    expect(liquidezCadena([fila({ bid: null, ask: null })], 100)).toBeNull();
    expect(liquidezCadena([], 100)).toBeNull();
  });
});

/** Serie de precios a partir de rendimientos diarios. */
function serie(rend: number[], inicio = 100): Vela[] {
  const out: Vela[] = [{ time: "2026-01-01", close: inicio }];
  rend.forEach((r, i) => {
    const d = new Date(Date.UTC(2026, 0, 2 + i)).toISOString().slice(0, 10);
    out.push({ time: d, close: out[out.length - 1].close * (1 + r) });
  });
  return out;
}

describe("betaContra", () => {
  const mercado = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.01 : -0.008) * (1 + (i % 5) / 10));

  it("un ticker que se mueve el doble tiene beta ~2 y se parece 100%", () => {
    const b = betaContra(serie(mercado.map((r) => r * 2)), serie(mercado))!;
    expect(b.beta).toBeCloseTo(2, 5);
    expect(b.parecido).toBeCloseTo(1, 5);
  });
  it("se mueve al revés → beta negativa", () => {
    expect(betaContra(serie(mercado.map((r) => -r)), serie(mercado))!.beta).toBeCloseTo(-1, 5);
  });
  it("con pocos días no da número", () => {
    expect(betaContra(serie(mercado.slice(0, 10)), serie(mercado.slice(0, 10)))).toBeNull();
  });
  it("solo usa las fechas que tienen las dos series", () => {
    const t = serie(mercado);
    const m = serie(mercado).filter((_, i) => i % 3 !== 0);
    expect(betaContra(t, m)).not.toBeNull();
  });
});

describe("escenarioBaja", () => {
  it("con 40% de nerviosismo, un día malo baja ~2.1% y una semana ~5.4%", () => {
    const e = escenarioBaja(100, 0.4, 95)!;
    expect(e.diaMaloPct).toBeCloseTo(-2.07, 1);
    expect(e.semanaMalaPct).toBeCloseTo(-5.4, 1);
    expect(e.rompeSuelo).toBe(false);
  });
  it("si el suelo está muy cerca, un día malo lo rompe", () => {
    expect(escenarioBaja(100, 0.4, 99)!.rompeSuelo).toBe(true);
  });
  it("un suelo por encima del precio no cuenta", () => {
    expect(escenarioBaja(100, 0.4, 105)!.suelo).toBeNull();
  });
  it("sin nerviosismo no hay escenario", () => {
    expect(escenarioBaja(100, null, 95)).toBeNull();
  });
});

describe("confianza", () => {
  it("todo leído → alta", () => {
    expect(confianza([{ que: "a", ok: true }, { que: "b", ok: true }]).nivel).toBe("alta");
  });
  it("dice qué faltó", () => {
    const c = confianza([{ que: "los muros", ok: true }, { que: "la cadena", ok: false }, { que: "las velas", ok: true }]);
    expect(c.nivel).toBe("media");
    expect(c.texto).toContain("faltó la cadena");
  });
  it("incluye de dónde salió cada dato", () => {
    expect(confianza([{ que: "la cadena", ok: true, nota: "MarketSnack, ~5 min de atraso" }]).texto)
      .toContain("Fuentes: la cadena de MarketSnack, ~5 min de atraso");
  });
  it("faltando casi todo → baja", () => {
    expect(confianza([{ que: "a", ok: false }, { que: "b", ok: false }, { que: "c", ok: true }]).nivel).toBe("baja");
  });
});

const SKEW_ABAJO: GammaSkew = { aceleraAbajo: 10, aceleraArriba: 1, ladoEngrasado: "abajo", sesgoPct: 80, distFlipPct: -1, lectura: "" };

describe("lecturaRiesgo", () => {
  const todoOk = confianza([{ que: "x", ok: true }]);

  it("resbala abajo + día de empujón + liquidez mala → riesgo ALTO", () => {
    const l = lecturaRiesgo({
      ticker: "XYZ", skew: SKEW_ABAJO, diaDeEmpujon: true, mercado: "SPY",
      liquidez: liquidezCadena([fila({ bid: 1, ask: 1.4 })], 100),
      beta: null, baja: null, confianza: todoOk,
    });
    expect(l.nivel).toBe("alto");
    expect(l.senal).toBe("Riesgo ALTO");
    expect(l.tono).toBe("down");
    expect(l.empuje).toMatch(/muy poco dinero/);
  });

  it("todo tranquilo → riesgo BAJO y recuerda la regla del 1%", () => {
    const l = lecturaRiesgo({
      ticker: "XYZ", skew: { ...SKEW_ABAJO, ladoEngrasado: "parejo" }, diaDeEmpujon: false, mercado: "SPY",
      liquidez: liquidezCadena([fila(), fila({ strike: 101 }), fila({ strike: 99 })], 100),
      beta: { beta: 1, parecido: 0.8, dias: 60 }, baja: escenarioBaja(100, 0.3, 90), confianza: todoOk,
    });
    expect(l.nivel).toBe("bajo");
    expect(l.empuje).toMatch(/1%/);
  });

  it("explica la beta en palabras", () => {
    const l = lecturaRiesgo({
      ticker: "NVDA", skew: null, diaDeEmpujon: null, mercado: "SPY", liquidez: null,
      beta: { beta: 1.8, parecido: 0.72, dias: 60 }, baja: null, confianza: todoOk,
    });
    expect(l.detalles.join(" ")).toContain("Cuando SPY se mueve 1%, NVDA suele moverse 1.8%");
    expect(l.detalles.join(" ")).toContain("se parece al mercado en un 72%");
  });

  it("con confianza baja lo dice en la señal", () => {
    const l = lecturaRiesgo({
      ticker: "XYZ", skew: null, diaDeEmpujon: null, mercado: "SPY", liquidez: null, beta: null, baja: null,
      confianza: confianza([{ que: "a", ok: false }, { que: "b", ok: false }]),
    });
    expect(l.senal).toBe("Pocos datos");
  });

  it("no usa jerga", () => {
    const l = lecturaRiesgo({
      ticker: "XYZ", skew: SKEW_ABAJO, diaDeEmpujon: true, mercado: "SPY",
      liquidez: liquidezCadena([fila()], 100), beta: { beta: 1.8, parecido: 0.7, dias: 60 },
      baja: escenarioBaja(100, 0.4, 99), confianza: todoOk,
    });
    const todo = [l.viendo, l.empuje, ...l.detalles].join(" ");
    for (const s of ["beta", "spread", "gamma", "OI", "IV", "bid", "ask", "skew"]) expect(todo).not.toMatch(new RegExp(`\\b${s}\\b`, "i"));
  });
});
