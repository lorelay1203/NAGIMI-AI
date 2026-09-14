import { describe, expect, it } from "vitest";
import {
  buildCreditPlan,
  elegirSpot,
  pasoDeStrikes,
  probVenceFuera,
  spotDeParidad,
} from "./creditSpread0dte";
import type { TicketChainRow } from "./contractTicket";

function fila(o: Partial<TicketChainRow> & { strike: number; type: "call" | "put" }): TicketChainRow {
  return { bid: 1, ask: 1.1, delta: 0.1, gamma: 0.001, iv: 0.2, volume: 100, oi: 100, ...o };
}

describe("pasoDeStrikes", () => {
  it("saca la separación típica aunque haya un hueco", () => {
    expect(pasoDeStrikes([7600, 7605, 7610, 7615, 7650])).toBe(5);
  });
  it("con un solo strike no revienta", () => {
    expect(pasoDeStrikes([100])).toBe(1);
  });
});

describe("buildCreditPlan", () => {
  const base = { spot: 100, callWall: 105, putWall: 95, regimen: "positive" as const, capital: 1000 };

  it("sin cadena no inventa nada", () => {
    const p = buildCreditPlan("X", [], base);
    expect(p.candidatos).toEqual([]);
    expect(p.aviso).toContain("no hay ningún spread");
  });

  it("cobra al bid y compra al ask, nunca al precio medio", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 2.0, ask: 2.4, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 1.0, ask: 1.4, delta: 0.1 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    const c = p.candidatos.find((x) => x.vender === 105 && x.comprar === 106)!;
    // Peor caso: 2.00 (bid) − 1.40 (ask) = 0.60 → $60. Con medios saldría $80.
    expect(c.credito).toBe(60);
    expect(c.riesgoMax).toBe(40);
  });

  it("descarta el que no deja crédito en vez de mostrarlo en negativo", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.05, ask: 0.10 }),
      fila({ strike: 106, type: "call", bid: 0.05, ask: 0.10 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    expect(p.candidatos).toEqual([]);
    expect(p.descartados.some((d) => d.motivo.includes("crédito"))).toBe(true);
  });

  it("descarta el que paga menos del mínimo aunque deje crédito (caso real SPX)", () => {
    // 7660/7665 de hoy: cobras 0.25, pagas 0.20 → $5 contra $495.
    const rows = [
      fila({ strike: 7660, type: "call", bid: 0.25, ask: 0.30, delta: 0.067 }),
      fila({ strike: 7665, type: "call", bid: 0.10, ask: 0.20, delta: 0.036 }),
    ];
    const p = buildCreditPlan("SPX", rows, { ...base, spot: 7644, callWall: 7825, putWall: 7630 });
    expect(p.candidatos).toEqual([]);
    expect(p.descartados.some((d) => d.motivo.includes("menos del"))).toBe(true);
  });

  it("marca el que no cabe y dice cuánto falta", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 2.0, ask: 2.0, delta: 0.2 }),
      fila({ strike: 110, type: "call", bid: 0.5, ask: 0.5, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, capital: 100 });
    const c = p.candidatos[0];
    expect(c.riesgoMax).toBe(350); // (5 × 100) − 150
    expect(c.cabe).toBe(false);
    expect(c.faltan).toBe(250);
    expect(p.aviso).toContain("Ninguno cabe");
  });

  it("calcula la esperanza y la deja negativa cuando lo es", () => {
    // 90% de acierto, cobras $20, arriesgas $180 → 0.9×20 − 0.1×180 = 0
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.20, ask: 0.20, delta: 0.10 }),
      fila({ strike: 107, type: "call", bid: 0.0, ask: 0.0, delta: 0.02 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    const c = p.candidatos[0];
    expect(c.popPct).toBe(90);
    expect(c.esperanza).toBeCloseTo(0.9 * c.credito - 0.1 * c.riesgoMax, 2);
  });

  it("solo considera strikes fuera del dinero", () => {
    const rows = [
      fila({ strike: 95, type: "call", bid: 6, ask: 6.2, delta: 0.9 }),  // dentro
      fila({ strike: 96, type: "call", bid: 5, ask: 5.2, delta: 0.85 }),
    ];
    const p = buildCreditPlan("X", rows, base);
    expect(p.candidatos.every((c) => c.vender > base.spot)).toBe(true);
  });

  it("marca cuáles quedan más allá del muro de gamma", () => {
    const rows = [
      fila({ strike: 103, type: "call", bid: 1.0, ask: 1.0, delta: 0.3 }),
      fila({ strike: 104, type: "call", bid: 0.6, ask: 0.6, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 0.5, ask: 0.5, delta: 0.15 }),
      fila({ strike: 107, type: "call", bid: 0.1, ask: 0.1, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, base); // callWall 105
    expect(p.candidatos.find((c) => c.vender === 106)?.trasElMuro).toBe(true);
    expect(p.candidatos.find((c) => c.vender === 103)?.trasElMuro).toBe(false);
  });

  it("en gamma negativa avisa antes de dar números", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.60, ask: 0.70, delta: 0.2 }),
      fila({ strike: 106, type: "call", bid: 0.25, ask: 0.30, delta: 0.1 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, regimen: "negative" });
    expect(p.aviso).toContain("gamma NEGATIVA");
  });

  it("acumula los avisos: gamma negativa Y esperanza negativa a la vez", () => {
    // Caso real del SPX: cabe, pero el GEX está negativo y la cuenta no sale.
    const rows = [
      fila({ strike: 7650, type: "call", bid: 1.60, ask: 1.70, delta: 0.42 }),
      fila({ strike: 7655, type: "call", bid: 0.20, ask: 0.20, delta: 0.20 }),
    ];
    const p = buildCreditPlan("SPX", rows, {
      spot: 7646, callWall: 7825, putWall: 7645, regimen: "negative", capital: 900,
    });
    expect(p.candidatos.length).toBeGreaterThan(0);
    expect(p.aviso).toContain("gamma NEGATIVA");
    expect(p.aviso).toContain("pierden dinero a la larga");
  });

  it("pone primero los que caben en la cuenta", () => {
    const rows = [
      fila({ strike: 105, type: "call", bid: 0.60, ask: 0.70, delta: 0.20 }),
      fila({ strike: 106, type: "call", bid: 0.40, ask: 0.45, delta: 0.15 }),
      fila({ strike: 107, type: "call", bid: 0.25, ask: 0.30, delta: 0.12 }),
      fila({ strike: 108, type: "call", bid: 0.15, ask: 0.20, delta: 0.09 }),
      fila({ strike: 110, type: "call", bid: 0.05, ask: 0.10, delta: 0.05 }),
    ];
    const p = buildCreditPlan("X", rows, { ...base, capital: 120 });
    expect(p.candidatos[0].cabe).toBe(true);
    // El de ancho 5 paga más ($50) pero arriesga $450: va después del que cabe.
    expect(p.candidatos.some((c) => !c.cabe && c.riesgoMax > 400)).toBe(true);
  });
});

// Cadena real del QQQ del 14-sep a las 12:49 ET. Los niveles decían 710.25;
// las opciones decían ~711.90.
const QQQ_VIVO: TicketChainRow[] = [
  fila({ strike: 712, type: "call", bid: 1.03, ask: 1.04, iv: 0.132 }),
  fila({ strike: 712, type: "put", bid: 1.13, ask: 1.14, iv: 0.135 }),
  fila({ strike: 713, type: "call", bid: 0.62, ask: 0.63, iv: 0.133 }),
  fila({ strike: 713, type: "put", bid: 1.73, ask: 1.75, iv: 0.139 }),
  fila({ strike: 714, type: "call", bid: 0.36, ask: 0.37, iv: 0.137 }),
  fila({ strike: 714, type: "put", bid: 2.42, ask: 2.50, iv: 0.140 }),
];

describe("spotDeParidad", () => {
  it("saca el precio real de las opciones (caso real QQQ)", () => {
    expect(spotDeParidad(QQQ_VIVO)).toBeCloseTo(711.9, 2);
  });

  it("ignora patas sin mercado o con bid/ask cruzado", () => {
    const rows = [
      ...QQQ_VIVO,
      fila({ strike: 700, type: "call", bid: 0, ask: 12 }),    // sin bid
      fila({ strike: 700, type: "put", bid: 0.05, ask: 0.06 }),
      fila({ strike: 720, type: "call", bid: 0.5, ask: 0.1 }), // cruzado
      fila({ strike: 720, type: "put", bid: 8, ask: 8.1 }),
    ];
    expect(spotDeParidad(rows)).toBeCloseTo(711.9, 2);
  });

  it("con menos de dos strikes con call y put no adivina", () => {
    expect(spotDeParidad([QQQ_VIVO[0], QQQ_VIVO[1]])).toBeNull();
    expect(spotDeParidad([])).toBeNull();
  });
});

describe("elegirSpot", () => {
  it("si los niveles vienen atrasados usa la cadena y lo avisa", () => {
    const s = elegirSpot(QQQ_VIVO, 710.25);
    expect(s.fuente).toBe("cadena");
    expect(s.spot).toBeCloseTo(711.9, 2);
    expect(s.desfasePct).toBeCloseTo(0.232, 2);
    expect(s.aviso).toContain("atrasado");
  });

  it("si la diferencia es mínima usa la cadena sin molestar", () => {
    const s = elegirSpot(QQQ_VIVO, 711.5);
    expect(s.fuente).toBe("cadena");
    expect(s.aviso).toBeNull();
  });

  it("si la paridad sale absurda (cadena rota) se queda con los niveles", () => {
    const s = elegirSpot(QQQ_VIVO, 650);
    expect(s.fuente).toBe("niveles");
    expect(s.spot).toBe(650);
  });

  it("sin cadena con qué calcular, usa los niveles", () => {
    expect(elegirSpot([], 710.25)).toMatchObject({ spot: 710.25, fuente: "niveles", aviso: null });
  });
});

describe("probVenceFuera (probabilidad sacada de los precios, sin IV)", () => {
  const calls = new Map(QQQ_VIVO.filter((r) => r.type === "call").map((r) => [r.strike, r]));
  const puts = new Map(QQQ_VIVO.filter((r) => r.type === "put").map((r) => [r.strike, r]));

  it("call: la caída de precio entre los strikes vecinos es la prob. de terminar dentro", () => {
    // 713: (1.035 − 0.365) ÷ 2 = 0.335 dentro → 66.5% vence sin valor.
    expect(probVenceFuera(713, 1, calls)!).toBeCloseTo(66.5, 1);
  });

  it("put: igual pero al revés (el put sube con el strike)", () => {
    // 713: (2.46 − 1.135) ÷ 2 = 0.6625 dentro → 33.75%.
    expect(probVenceFuera(713, 1, puts)!).toBeCloseTo(33.75, 1);
  });

  it("si falta el vecino de abajo usa el escalón de arriba", () => {
    // 712: (1.035 − 0.625) ÷ 1 = 0.41 dentro → 59%.
    expect(probVenceFuera(712, 1, calls)!).toBeCloseTo(59, 1);
  });

  it("sin precios con qué medir → null (y el plan cae al delta)", () => {
    expect(probVenceFuera(800, 1, calls)).toBeNull();
  });
});

describe("buildCreditPlan con el precio real (regresión QQQ 14-sep)", () => {
  const opts = { spot: 711.9, callWall: 720, putWall: 710, regimen: "negative" as const, capital: 911 };

  it("el 712/713 que parecía ganador, con los precios reales pierde dinero", () => {
    const p = buildCreditPlan("QQQ", QQQ_VIVO, opts);
    const c = p.candidatos.find((x) => x.vender === 712 && x.comprar === 713)!;
    expect(c.credito).toBe(40);   // 1.03 bid − 0.63 ask
    expect(c.riesgoMax).toBe(60);
    expect(c.popPct).toBeCloseTo(59, 1);
    expect(c.esperanza!).toBeLessThan(0);
    expect(c.sospechoso).toBe(false);
  });

  it("si una pata no tiene mercado y la cuenta sale demasiado buena, se marca sospechoso", () => {
    const rows = [
      fila({ strike: 712, type: "call", bid: 1.18, ask: 1.19, delta: 0.48 }),
      fila({ strike: 713, type: "call", bid: 0, ask: 0.40, delta: 0.40 }), // sin bid: no hay precio vecino
      fila({ strike: 714, type: "call", bid: 0.36, ask: 0.37, delta: 0.30 }),
    ];
    const p = buildCreditPlan("QQQ", rows, opts);
    const rara = p.candidatos.find((x) => x.vender === 712 && x.comprar === 713)!;
    expect(rara.sospechoso).toBe(true);
    expect(p.candidatos[0].sospechoso).toBe(false);
    expect(p.candidatos[p.candidatos.length - 1].sospechoso).toBe(true);
    expect(p.aviso).toContain("precio VIEJO");
    // El sospechoso no tapa que los limpios pierden dinero.
    expect(p.aviso).toContain("pierden dinero a la larga");
  });
});
