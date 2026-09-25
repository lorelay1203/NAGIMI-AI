// ============================================================================
// Agente TÉCNICO (TCH) — el rol que FinAnalista tiene en "Pronto":
//   › señales de régimen de precio · › momentum normalizado
//   › control de marcos de tiempo  · › explicar niveles de invalidación
//
// Aquí sí está hecho, con las velas diarias que Nagimi ya baja:
//   · Tendencia  = media de 20 sesiones contra la de 50.
//   · Momentum   = RSI de 14 (0-100, 50 es neutro).
//   · Volatilidad= ATR de 14 en % del precio (cuánto se mueve un día normal).
//   · Invalidación = el muro de gamma del lado contrario: si lo pierde, la
//     lectura técnica deja de valer.
//
// Puro: recibe velas y niveles, devuelve la lectura. Sin red.
// ============================================================================

export interface VelaTecnica { high: number; low: number; close: number }

export interface LecturaTecnica {
  /** Etiqueta corta para la tarjeta del agente. */
  senal: string;
  tono: "up" | "down" | "neutral";
  /** Qué está viendo, en una línea. */
  viendo: string;
  /** Qué significa y dónde deja de valer. */
  empuje: string;
  ema20: number;
  ema50: number;
  rsi: number;
  atrPct: number;
  /** Precio donde la lectura se rompe (muro contrario), si se conoce. */
  invalidacion: number | null;
}

/** Media móvil exponencial del último valor de la serie. */
export function ema(valores: number[], periodo: number): number | null {
  if (valores.length < periodo) return null;
  const k = 2 / (periodo + 1);
  // Arranca con la media simple del primer bloque, como hacen los gráficos.
  let v = valores.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < valores.length; i++) v = valores[i] * k + v * (1 - k);
  return v;
}

/** RSI de Wilder (0-100). null si no hay velas suficientes. */
export function rsi(cierres: number[], periodo = 14): number | null {
  if (cierres.length < periodo + 1) return null;
  let ganancia = 0, perdida = 0;
  for (let i = 1; i <= periodo; i++) {
    const d = cierres[i] - cierres[i - 1];
    if (d >= 0) ganancia += d; else perdida -= d;
  }
  let mediaG = ganancia / periodo;
  let mediaP = perdida / periodo;
  for (let i = periodo + 1; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1];
    mediaG = (mediaG * (periodo - 1) + (d > 0 ? d : 0)) / periodo;
    mediaP = (mediaP * (periodo - 1) + (d < 0 ? -d : 0)) / periodo;
  }
  if (mediaP === 0) return 100;
  const rs = mediaG / mediaP;
  return 100 - 100 / (1 + rs);
}

/** ATR de Wilder en % del último cierre: cuánto se mueve en un día normal. */
export function atrPct(velas: VelaTecnica[], periodo = 14): number | null {
  if (velas.length < periodo + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < velas.length; i++) {
    const v = velas[i], prev = velas[i - 1];
    tr.push(Math.max(v.high - v.low, Math.abs(v.high - prev.close), Math.abs(v.low - prev.close)));
  }
  let atr = tr.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < tr.length; i++) atr = (atr * (periodo - 1) + tr[i]) / periodo;
  const cierre = velas[velas.length - 1].close;
  return cierre > 0 ? (atr / cierre) * 100 : null;
}

/**
 * La lectura técnica completa. Devuelve null si no hay velas suficientes
 * (hacen falta ~50 sesiones para que la media larga signifique algo).
 */
export function lecturaTecnica(input: {
  velas: VelaTecnica[];
  suelo: number | null;
  techo: number | null;
}): LecturaTecnica | null {
  const { velas, suelo, techo } = input;
  const cierres = velas.map((v) => v.close);
  const e20 = ema(cierres, 20);
  const e50 = ema(cierres, 50);
  const r = rsi(cierres);
  const a = atrPct(velas);
  if (e20 == null || e50 == null || r == null || a == null) return null;

  const precio = cierres[cierres.length - 1];
  const arriba = e20 > e50;
  const separacion = Math.abs(e20 - e50) / (e50 || 1) * 100;
  // Con las medias casi pegadas no hay tendencia: es un lateral.
  const lateral = separacion < 0.5;

  const tono: LecturaTecnica["tono"] = lateral ? "neutral" : arriba ? "up" : "down";
  const senal = lateral ? "Sin tendencia" : arriba ? "Tendencia ARRIBA" : "Tendencia ABAJO";

  const momento = r >= 70 ? "muy estirado al alza (termómetro de estirón en " + r.toFixed(0) + " de 100)"
    : r >= 55 ? "con fuerza compradora (termómetro de estirón en " + r.toFixed(0) + " de 100)"
    : r <= 30 ? "muy castigado (termómetro de estirón en " + r.toFixed(0) + " de 100)"
    : r <= 45 ? "con fuerza vendedora (termómetro de estirón en " + r.toFixed(0) + " de 100)"
    : "sin fuerza clara (termómetro de estirón en " + r.toFixed(0) + " de 100)";

  const viendo = `Precio promedio de los últimos 20 días: $${e20.toFixed(2)}; de los últimos 50: $${e50.toFixed(2)}; `
    + `${momento}. Un día normal se mueve ${a.toFixed(1)}%.`;

  // El nivel de invalidación es el muro del lado contrario a la tendencia.
  const invalidacion = lateral ? null : arriba ? suelo : techo;
  const dondeSeRompe = invalidacion != null
    ? ` Si pierde $${invalidacion.toFixed(2)} ${arriba ? "hacia abajo" : "hacia arriba"}, esta lectura deja de valer.`
    : " Sin muro claro al otro lado, no hay un punto limpio donde decir que se rompió.";

  const empuje = lateral
    ? `Las dos medias están casi pegadas: no hay tendencia que seguir, y operar rupturas aquí suele salir mal.`
      + ` Con un movimiento diario de ${a.toFixed(1)}%, cualquier vela normal te saca del trade si pones el stop muy cerca.`
    : `${arriba ? "El precio manda hacia arriba" : "El precio manda hacia abajo"} y el momentum va ${r >= 50 ? "a favor" : "en contra"} de esa tendencia.`
      + dondeSeRompe;

  return { senal, tono, viendo, empuje, ema20: e20, ema50: e50, rsi: r, atrPct: a, invalidacion: invalidacion ?? null, ...(precio ? {} : {}) };
}
