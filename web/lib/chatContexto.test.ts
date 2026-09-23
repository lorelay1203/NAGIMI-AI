import { describe, expect, it } from "vitest";
import {
  construirContextoChat, preguntasSugeridas, contextoATexto, direccionEnPalabras,
  LIMITE_PREGUNTAS, type ContextoChat,
} from "./chatContexto";
import type { ProPrediction } from "./prediction";
import type { GexAnalysis } from "./gex";
import type { LevelsReport, Level } from "./levels";

function level(o: Partial<Level>): Level {
  return { price: 95, kind: "soporte", strength: 70, distancePct: -5, sources: {} as never, flipped: false, why: "pivote tocado 3 veces", ...o };
}
function levels(o: Partial<LevelsReport>): LevelsReport {
  return { spot: 100, supports: [], resistances: [], keySupport: null, keyResistance: null, tolerancePct: 1, ...o };
}
function prediction(o: Partial<ProPrediction>): ProPrediction {
  return {
    horizonDays: 20, spot: 100, iv: 0.3,
    bear: { kind: "bear", target: 90, changePct: -10, probability: 0.3, driver: "soporte roto" },
    base: { kind: "base", target: 102, changePct: 2, probability: 0.4, driver: "imán de gamma" },
    bull: { kind: "bull", target: 115, changePct: 15, probability: 0.3, driver: "ruptura de resistencia" },
    score: 55, active: 3, confidence: 62, levels: [], direction: "up",
    summary: "", caveat: null, calibration: { applied: false, shiftPct: 0, samples: 0 },
    ...o,
  };
}
function gex(o: Partial<GexAnalysis>): GexAnalysis {
  return { spot: 100, iv: 0.3, nodes: [], kingStrike: 101, flipStrike: 98, regime: "positive", totalNetGex: 1, direction: "flat", confidence: 50, lowLiquidity: false, n: 5, ...o };
}

describe("construirContextoChat", () => {
  it("sin nada que leer deja todo en null y lo apunta en faltantes", () => {
    const c = construirContextoChat({ ticker: "AAPL" });
    expect(c.ticker).toBe("AAPL");
    expect(c.precio).toBeNull();
    expect(c.direccion).toBeNull();
    expect(c.regimenGamma).toBeNull();
    expect(c.escenarios).toBeNull();
    // Lo importante: no hay un solo número inventado y la falta está declarada.
    expect(c.faltantes).toContain("el precio actual");
    expect(c.faltantes).toContain("la dirección que ve el agente");
    expect(c.faltantes.length).toBeGreaterThan(4);
  });

  it("traduce dirección y régimen al español de la página", () => {
    const c = construirContextoChat({ ticker: "SPY", prediction: prediction({ direction: "down" }), gex: gex({ regime: "negative" }) });
    expect(c.direccion).toBe("baja");
    expect(c.regimenGamma).toBe("negativa");
    expect(c.confianza).toBe(62);
    expect(c.horizonteDias).toBe(20);
  });

  it("los muros del GEX en vivo mandan sobre los estimados de la cadena", () => {
    const c = construirContextoChat({
      ticker: "TSLA",
      gex: gex({ kingStrike: 101, flipStrike: 98 }),
      muros: { callWall: 210, putWall: 190, magnet: 200, gammaFlip: 197 },
    });
    expect(c.muroCalls).toBe(210);
    expect(c.muroPuts).toBe(190);
    expect(c.iman).toBe(200); // el imán en vivo, no el kingStrike estimado
    expect(c.flipGamma).toBe(197);
  });

  it("si no llega el GEX en vivo cae al imán y al flip estimados", () => {
    const c = construirContextoChat({ ticker: "TSLA", gex: gex({ kingStrike: 101, flipStrike: 98 }), muros: null });
    expect(c.iman).toBe(101);
    expect(c.flipGamma).toBe(98);
    expect(c.muroCalls).toBeNull();
    expect(c.faltantes).toContain("los muros de calls y puts");
  });

  it("un precio en 0 no es un precio: queda como faltante", () => {
    const c = construirContextoChat({ ticker: "X", gex: gex({ spot: 0 }), levels: levels({ spot: 0 }) });
    expect(c.precio).toBeNull();
    expect(c.faltantes).toContain("el precio actual");
  });

  it("con aviso de datos NO manda escenarios y explica por qué", () => {
    const c = construirContextoChat({ ticker: "IWM", prediction: prediction({ caveat: "cadena con poca liquidez" }) });
    expect(c.escenarios).toBeNull();
    expect(c.avisoDatos).toBe("cadena con poca liquidez");
    expect(c.faltantes.some((f) => f.includes("cadena con poca liquidez"))).toBe(true);
  });

  it("sin aviso sí manda los tres escenarios ya redondeados", () => {
    const c = construirContextoChat({ ticker: "QQQ", prediction: prediction({}) });
    expect(c.escenarios).not.toBeNull();
    expect(c.escenarios!.alcista.objetivo).toBe(115);
    expect(c.escenarios!.alcista.probabilidadPct).toBe(30);
    expect(c.escenarios!.base.cambioPct).toBe(2);
  });

  it("pasa la IV a porcentaje legible y arrastra los niveles clave", () => {
    const c = construirContextoChat({
      ticker: "NVDA",
      gex: gex({ iv: 0.4235 }),
      levels: levels({ keySupport: level({ price: 95 }), keyResistance: level({ price: 112, kind: "resistencia", why: "muro de calls" }) }),
    });
    expect(c.ivPct).toBe(42.4);
    expect(c.soporteClave).toEqual({ precio: 95, porQue: "pivote tocado 3 veces" });
    expect(c.resistenciaClave).toEqual({ precio: 112, porQue: "muro de calls" });
  });

  it("reusa la analogía del Veredicto para no contradecirla", () => {
    const c = construirContextoChat({ ticker: "AAPL", prediction: prediction({}), gex: gex({ regime: "positive" }) });
    expect(c.analogiaDelDia).toContain("canica");
  });

  it("nunca incluye el saldo de la cuenta, solo el porcentaje de riesgo", () => {
    const c = construirContextoChat({ ticker: "AAPL", riesgoPorOperacionPct: 1 });
    expect(c.riesgoPorOperacionPct).toBe(1);
    expect(JSON.stringify(c)).not.toContain("accountSize");
  });
});

describe("preguntasSugeridas", () => {
  const base = (o: Partial<ContextoChat> = {}): ContextoChat => ({
    ...construirContextoChat({ ticker: "AAPL" }), ...o,
  });

  it("siempre son exactamente 5", () => {
    expect(preguntasSugeridas(base())).toHaveLength(5);
    expect(preguntasSugeridas(base({ muroCalls: 210, regimenGamma: "positiva", ivPct: 22, direccion: "sube", confianza: 70, riesgoPorOperacionPct: 1 }))).toHaveLength(5);
  });

  it("usa el muro real cuando existe", () => {
    const [p] = preguntasSugeridas(base({ muroCalls: 210 }));
    expect(p).toContain("$210");
    expect(p).toContain("muro de calls");
  });

  it("sin muro de calls usa el de puts antes de caer a lo genérico", () => {
    const [p] = preguntasSugeridas(base({ muroPuts: 190 }));
    expect(p).toContain("muro de puts");
    expect(p).toContain("$190");
  });

  it("sin ningún muro NO inventa un precio", () => {
    const [p] = preguntasSugeridas(base());
    expect(p).not.toContain("$");
    expect(p).toContain("niveles que de verdad importan");
  });

  it("la pregunta de riesgo aparece siempre, haya o no datos", () => {
    for (const ctx of [base(), base({ muroCalls: 210, direccion: "baja" })]) {
      expect(preguntasSugeridas(ctx).some((p) => p.includes("puede salir mal"))).toBe(true);
    }
  });

  it("pregunta por la dirección con las palabras de ella", () => {
    const qs = preguntasSugeridas(base({ direccion: "lateral", confianza: 48 }));
    expect(qs.some((p) => p.includes("está lateral") && p.includes("48 de 100"))).toBe(true);
  });

  it("aplica su porcentaje de riesgo real en la quinta pregunta", () => {
    const qs = preguntasSugeridas(base({ riesgoPorOperacionPct: 1 }));
    expect(qs[4]).toContain("1% de la cuenta");
  });

  it("todas son de opciones, no de acciones: nada de valoración", () => {
    const qs = preguntasSugeridas(base({ muroCalls: 210, regimenGamma: "positiva", ivPct: 22 }));
    const todo = qs.join(" ").toLowerCase();
    expect(todo).not.toContain("sobrevalorada");
    expect(todo).not.toContain("competidores");
    expect(todo).toContain("prima");
  });

  it("direccionEnPalabras traduce las tres direcciones", () => {
    expect(direccionEnPalabras("sube")).toBe("va para arriba");
    expect(direccionEnPalabras("baja")).toBe("va para abajo");
    expect(direccionEnPalabras("lateral")).toBe("está lateral");
  });
});

describe("contextoATexto", () => {
  it("escribe 'sin dato' en lugar de dejar el hueco", () => {
    const t = contextoATexto(construirContextoChat({ ticker: "AAPL" }));
    expect(t).toContain("Precio actual: sin dato");
    expect(t).toContain("Muro de calls (techo): sin dato");
    expect(t).toContain("Escenarios a ese horizonte: sin dato");
    expect(t).toContain("NO SE PUDIERON LEER");
  });

  it("nunca escribe $0 como si fuera un precio", () => {
    const t = contextoATexto(construirContextoChat({ ticker: "AAPL", gex: gex({ spot: 0, kingStrike: 0 }) }));
    expect(t).not.toContain("$0");
  });

  it("con datos completos los escribe con formato de la página", () => {
    const c = construirContextoChat({
      ticker: "TSLA",
      prediction: prediction({ spot: 200, direction: "up", confidence: 71 }),
      gex: gex({ spot: 200, iv: 0.45, regime: "negative" }),
      muros: { callWall: 210, putWall: 190, magnet: 200, gammaFlip: 197 },
      riesgoPorOperacionPct: 1,
    });
    const t = contextoATexto(c);
    expect(t).toContain("Ticker: TSLA");
    expect(t).toContain("Muro de calls (techo): $210");
    expect(t).toContain("Régimen de gamma: negativa");
    expect(t).toContain("Volatilidad implícita: 45%");
    expect(t).toContain("1% de la cuenta");
  });

  it("avisa de la liquidez baja para que el chat no la pase por alto", () => {
    const c = construirContextoChat({ ticker: "X", gex: gex({ lowLiquidity: true }) });
    expect(contextoATexto(c)).toContain("poca liquidez");
  });

  it("aguanta que le pasen basura sin reventar", () => {
    expect(contextoATexto(null)).toBe("No hay análisis cargado.");
    expect(contextoATexto(undefined)).toBe("No hay análisis cargado.");
    expect(contextoATexto({ ticker: "SOLO" })).toContain("Ticker: SOLO");
  });

  it("deja claro que el saldo de la cuenta no viaja", () => {
    const t = contextoATexto(construirContextoChat({ ticker: "AAPL" }));
    expect(t).toContain("no disponible");
  });
});

describe("LIMITE_PREGUNTAS", () => {
  it("es el mismo tope que muestra el contador del chat", () => {
    expect(LIMITE_PREGUNTAS).toBe(10);
  });
});
