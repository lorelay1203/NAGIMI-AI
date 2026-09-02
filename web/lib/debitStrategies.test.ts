import { describe, expect, it } from "vitest";
import { construirDebitos, pasoMediano, strikeMasCercano, type CadenaMids } from "./debitStrategies";
import { GUIA, TODAS, COMPRAR, VENDER, explicacion } from "./strategyGuide";

/** Cadena sintética alrededor de 100, con precios que decaen al alejarse. */
function cadena(spot = 100, paso = 5, n = 9): CadenaMids {
  const call = new Map<number, number>(), put = new Map<number, number>();
  const strikes: number[] = [];
  for (let i = -n; i <= n; i++) {
    const k = spot + i * paso;
    if (k <= 0) continue;
    strikes.push(k);
    // Valor intrínseco + un extrínseco que baja con la distancia.
    const extr = Math.max(0.2, 4 - Math.abs(i) * 0.6);
    call.set(k, Math.max(0.05, Math.max(0, spot - k) + extr));
    put.set(k, Math.max(0.05, Math.max(0, k - spot) + extr));
  }
  return { call, put, strikes: strikes.sort((a, b) => a - b) };
}

const base = { spot: 100, iv: 0.3, dte: 30, cadena: cadena(), maxCosto: 100_000, pasosSpread: 2 };

describe("utilidades", () => {
  it("encuentra el strike más cercano", () => {
    expect(strikeMasCercano([90, 95, 100, 105], 101)).toBe(100);
    expect(strikeMasCercano([90, 95, 100, 105], 104)).toBe(105);
  });
  it("calcula la separación típica entre strikes", () => {
    expect(pasoMediano([90, 95, 100, 105])).toBe(5);
    expect(pasoMediano([100])).toBe(1);
  });
});

describe("construirDebitos", () => {
  it("un call simple es alcista y su pérdida es lo que pagas", () => {
    const [c] = construirDebitos({ ...base, permitidas: ["long_call"] });
    expect(c.kind).toBe("long_call");
    expect(c.legs).toHaveLength(1);
    expect(c.legs[0]).toMatchObject({ side: "buy", optionType: "call" });
    expect(c.maxPerdida).toBeCloseTo(c.costo, 5);
    expect(c.maxGanancia).toBeNull(); // sin techo
  });

  it("un put simple es bajista y también arriesga solo la prima", () => {
    const [c] = construirDebitos({ ...base, permitidas: ["long_put"] });
    expect(c.kind).toBe("long_put");
    expect(c.legs[0].optionType).toBe("put");
    expect(c.maxPerdida).toBeCloseTo(c.costo, 5);
  });

  it("el spread de débito cuesta MENOS que el call solo, pero topa la ganancia", () => {
    const [solo] = construirDebitos({ ...base, permitidas: ["long_call"] });
    const [spread] = construirDebitos({ ...base, permitidas: ["call_debit"] });
    expect(spread.costo).toBeLessThan(solo.costo);
    expect(spread.maxGanancia).not.toBeNull();
    expect(spread.legs).toHaveLength(2);
  });

  it("el straddle compra call y put del MISMO strike", () => {
    const [c] = construirDebitos({ ...base, permitidas: ["straddle"] });
    expect(c.legs).toHaveLength(2);
    expect(c.legs[0].strike).toBe(c.legs[1].strike);
    expect(c.legs.every((l) => l.side === "buy")).toBe(true);
  });

  it("el strangle usa strikes separados y sale más barato que el straddle", () => {
    const [st] = construirDebitos({ ...base, permitidas: ["straddle"] });
    const [sg] = construirDebitos({ ...base, permitidas: ["strangle"] });
    expect(sg.legs[0].strike).not.toBe(sg.legs[1].strike);
    expect(sg.costo).toBeLessThan(st.costo);
  });

  it("el straddle necesita menos movimiento que el strangle para empatar", () => {
    const [st] = construirDebitos({ ...base, permitidas: ["straddle"] });
    const [sg] = construirDebitos({ ...base, permitidas: ["strangle"] });
    expect(st.movimientoNecesarioPct).toBeLessThan(sg.movimientoNecesarioPct);
  });

  // Lo importante para cuenta chica.
  it("descarta lo que no cabe en el presupuesto", () => {
    const caras = construirDebitos({ ...base, maxCosto: 30, permitidas: ["straddle"] });
    expect(caras).toHaveLength(0);
    const baratas = construirDebitos({ ...base, maxCosto: 30, permitidas: ["long_call", "call_debit"] });
    expect(baratas.every((c) => c.costo <= 30)).toBe(true);
  });

  it("solo devuelve las estrategias permitidas", () => {
    const r = construirDebitos({ ...base, permitidas: ["long_call", "straddle"] });
    expect(new Set(r.map((c) => c.kind))).toEqual(new Set(["long_call", "straddle"]));
  });

  it("ordena primero lo que necesita menos movimiento", () => {
    const r = construirDebitos({ ...base, permitidas: ["long_call", "call_debit", "straddle", "strangle"] });
    for (let i = 1; i < r.length; i++) {
      expect(r[i].movimientoNecesarioPct).toBeGreaterThanOrEqual(r[i - 1].movimientoNecesarioPct);
    }
  });

  it("una cadena vacía no revienta", () => {
    const vacia: CadenaMids = { call: new Map(), put: new Map(), strikes: [] };
    expect(construirDebitos({ ...base, cadena: vacia, permitidas: ["long_call"] })).toEqual([]);
  });

  it("sin volatilidad no inventa nada", () => {
    expect(construirDebitos({ ...base, iv: 0, permitidas: ["long_call"] })).toEqual([]);
  });
});

describe("guía de estrategias", () => {
  it("cada estrategia tiene explicación completa", () => {
    for (const k of TODAS) {
      const g = GUIA[k];
      expect(g.nombre, k).toBeTruthy();
      expect(g.apuesta.length, k).toBeGreaterThan(10);
      expect(g.comoFunciona.length, k).toBeGreaterThan(40);
      expect(g.riesgo.length, k).toBeGreaterThan(20);
      expect(g.cuentaChica.length, k).toBeGreaterThan(20);
    }
  });

  it("las familias están bien repartidas", () => {
    expect(VENDER).toContain("iron_condor");
    expect(COMPRAR).toContain("long_call");
    expect(COMPRAR).toContain("straddle");
    expect(VENDER.length + COMPRAR.length).toBe(TODAS.length);
  });

  it("el texto de explicación menciona riesgo y cuenta chica", () => {
    const t = explicacion("straddle");
    expect(t).toMatch(/Riesgo:/);
    expect(t).toMatch(/cuenta chica/i);
    expect(t).toMatch(/MISMO strike/);
  });
});
