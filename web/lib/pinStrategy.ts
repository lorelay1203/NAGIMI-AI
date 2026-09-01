// ============================================================================
// Estrategia "vuelta al imán" (pin en gamma positiva) — portada del Agente 0DTE.
// Lógica PURA: sin red ni disco, así que se puede probar y también evaluar en el
// navegador en cada refresco.
//
// La idea, en simple: cuando el GEX es POSITIVO el mercado se vuelve pegajoso —
// los creadores de mercado empujan el precio de vuelta hacia el "imán" (el strike
// donde se acumula la gamma). Si el precio se ha estirado lejos del imán, se
// apuesta a que VUELVE: se va corto si está por encima, largo si está por debajo.
//
// En gamma NEGATIVA no aplica: ahí el mercado acelera en vez de frenar.
// ============================================================================

export type Direction = "long" | "short";

/** Parámetros de la estrategia, en PUNTOS del subyacente. */
export interface PinParams {
  /** Cuánto tiene que haberse estirado el precio del imán para que valga la pena. */
  minGapPts: number;
  /** Stop fijo cuando no hay un gamma flip útil del lado correcto. */
  fixedStopPts: number;
  /** El stop nunca más pegado que esto (uno de 2 pts saltaría al instante). */
  minStopPts: number;
  /** Riesgo/beneficio mínimo para dar el trade por "listo". */
  minRR: number;
  /** Velocidad de volumen a partir de la cual el flujo en contra pesa. */
  flowFastVel: number;
  /** Fracción de flujo en contra que hace esperar. */
  flowBurstShare: number;
}

export const DEFAULT_PIN_PARAMS: PinParams = {
  minGapPts: 5, fixedStopPts: 15, minStopPts: 8,
  minRR: 1.2, flowFastVel: 1.5, flowBurstShare: 0.60,
};

// Las distancias escalan con σ (el movimiento esperado del día): exigir más
// recorrido cuando hay más volatilidad.
const GAP_SIGMA_K = 0.5;
const FIXED_SIGMA_K = 0.6;
const MINSTOP_SIGMA_K = 0.3;
/** SPX afloja el R:B para permitir fades cortos (~10 pts) contra stops anchos. */
const SPX_MIN_RR = 0.65;
/** ≥58% del flujo agresivo de un lado ya se considera dirección clara. */
const FLOW_DIR_MIN = 0.58;

/**
 * Parámetros ajustados al instrumento y a la volatilidad del día.
 *
 * Un valor fijo en puntos no sirve para todos: 5 puntos son un 0,06% en SPX pero
 * un 0,65% en SPY. Por eso las distancias se calculan como porcentaje del precio
 * (con un piso) y escalan con σ.
 */
export function dynamicPinParams(spot: number, sigma: number | null, ticker: string): PinParams {
  const s = sigma != null && sigma > 0 ? sigma : 0;
  const isSpx = ticker.trim().toUpperCase().replace(/^\//, "") === "SPX";
  const gapFloor = isSpx ? 10 : spot * 0.0013;
  const fixedFloor = isSpx ? 15 : spot * 0.0019;
  const minStopFloor = isSpx ? 8 : spot * 0.0010;
  return {
    ...DEFAULT_PIN_PARAMS,
    minGapPts: isSpx ? gapFloor : Math.max(gapFloor, GAP_SIGMA_K * s),
    fixedStopPts: Math.max(fixedFloor, FIXED_SIGMA_K * s),
    minStopPts: Math.max(minStopFloor, MINSTOP_SIGMA_K * s),
    minRR: isSpx ? SPX_MIN_RR : DEFAULT_PIN_PARAMS.minRR,
  };
}

export interface PinSetup {
  direction: Direction;
  entry: number;
  target: number;
  stop: number;
  reason: string;
}

/**
 * ¿Hay setup de vuelta al imán ahora mismo? Devuelve null si no lo hay.
 *
 * Solo en gamma positiva y solo si el precio se ha alejado lo suficiente del
 * imán. El stop es el gamma flip si cae del lado correcto; si no, uno fijo.
 */
export function evaluatePin(
  spot: number,
  regime: "positive" | "negative",
  magnet: number | null,
  flip: number | null,
  params: PinParams = DEFAULT_PIN_PARAMS,
): PinSetup | null {
  if (!(spot > 0) || regime !== "positive" || magnet == null) return null;
  const gap = Math.abs(spot - magnet);
  if (gap < params.minGapPts) return null;

  const direction: Direction = spot > magnet ? "short" : "long";
  const target = magnet;

  let stop: number;
  if (direction === "short") {
    const cand = flip != null && flip > spot ? flip : spot + params.fixedStopPts;
    stop = Math.max(cand, spot + params.minStopPts);
  } else {
    const cand = flip != null && flip < spot ? flip : spot - params.fixedStopPts;
    stop = Math.min(cand, spot - params.minStopPts);
  }

  const dirTxt = direction === "short" ? "por encima" : "por debajo";
  const reason = `Gamma positiva y el precio está ${gap.toFixed(0)} pts ${dirTxt} del imán `
    + `${magnet}: se apuesta a que vuelve al imán.`;

  return { direction, entry: spot, target, stop, reason };
}

/** Riesgo/beneficio del setup: recorrido al objetivo ÷ recorrido al stop. */
export function riskReward(d: PinSetup): number {
  const reward = Math.abs(d.target - d.entry);
  const risk = Math.abs(d.stop - d.entry);
  return risk > 0 ? reward / risk : 0;
}

/** Señales del flujo en vivo para filtrar el setup. Todo opcional. */
export interface FlowCtx {
  /** Velocidad del volumen (×). Alta = la cinta corre. */
  velocity?: number | null;
  /** Premium agresivo alcista (calls compradas + puts vendidas). */
  bull?: number | null;
  /** Premium agresivo bajista (puts compradas + calls vendidas). */
  bear?: number | null;
}

export type PinStatus = "ready" | "wait";

export interface PinVerdict {
  status: PinStatus;
  reason: string;
  rr: number;
}

/**
 * Filtra el setup con lo que hace el mercado AHORA. La vuelta al imán solo tiene
 * ventaja si la cinta no corre en contra: no sirve recomendar "puts al imán"
 * mientras el precio sube sin parar.
 */
export function gatePin(
  d: PinSetup,
  ctx: FlowCtx,
  flip: number | null,
  params: PinParams = DEFAULT_PIN_PARAMS,
): PinVerdict {
  const rr = riskReward(d);
  const short = d.direction === "short";

  // 1) Poco recorrido al imán para el riesgo que se corre.
  if (rr < params.minRR) {
    return { status: "wait", rr,
      reason: `Riesgo/beneficio bajo (${rr.toFixed(1)}:1) — poco recorrido al imán para lo que arriesgas. Espera mejor precio.` };
  }

  // 2) El flip está entre el precio y el imán: para llegar habría que cruzar la
  //    zona donde el mercado cambia de comportamiento. El pin no es limpio.
  if (flip != null) {
    const crosses = short ? (flip < d.entry && flip > d.target) : (flip > d.entry && flip < d.target);
    if (crosses) {
      return { status: "wait", rr,
        reason: `El punto de giro (${flip.toFixed(0)}) está entre el precio y el imán — habría que cruzar la zona de aceleración. La idea no es limpia.` };
    }
  }

  // 3) Flujo agresivo fuerte y RÁPIDO en contra.
  //    Ojo: la dirección sale del premium bien clasificado (comprar calls o
  //    vender puts = alcista), NO del signo del CVD, que es ciego a call/put y
  //    se invierte con flujo de puts.
  const vel = ctx.velocity ?? 1;
  const bull = ctx.bull ?? 0, bear = ctx.bear ?? 0, total = bull + bear;
  if (total > 0 && vel >= params.flowFastVel) {
    const bullShare = bull / total;
    const against = short ? bullShare >= FLOW_DIR_MIN : bullShare <= 1 - FLOW_DIR_MIN;
    if (against) {
      return { status: "wait", rr,
        reason: `El dinero está entrando fuerte ${short ? "al alza" : "a la baja"} (velocidad ${vel.toFixed(1)}×), justo en contra. Espera a que se calme o gire.` };
    }
  }

  // 4) Flujo agresivo dominando en contra (aunque no sea rápido).
  if (total > 0) {
    const againstShare = short ? bull / total : bear / total;
    if (againstShare >= params.flowBurstShare) {
      return { status: "wait", rr,
        reason: `El flujo manda ${short ? "al alza" : "a la baja"} (${Math.round(againstShare * 100)}%) en contra de la idea. Espera a que se agote o gire.` };
    }
  }

  return { status: "ready", rr, reason: d.reason };
}

/** Por qué NO hay setup ahora, explicado en simple. */
export function noPinReason(
  spot: number | null,
  regime: "positive" | "negative",
  magnet: number | null,
  params: PinParams = DEFAULT_PIN_PARAMS,
): string {
  if (regime === "negative") return "El GEX está negativo: hoy el mercado acelera en vez de frenar, así que la vuelta al imán no aplica.";
  if (magnet == null) return "No hay un imán de gamma claro.";
  if (spot == null || !(spot > 0)) return "Sin precio del subyacente.";
  const gap = Math.abs(spot - magnet);
  if (gap < params.minGapPts) {
    const gluedCut = Math.max(3, 0.25 * params.minGapPts);
    if (gap < gluedCut) return `El precio está pegado al imán (${gap.toFixed(0)} pts): no hay recorrido que aprovechar.`;
    return `Le falta estiramiento: ${gap.toFixed(0)} de ${params.minGapPts.toFixed(0)} pts. Para la volatilidad de hoy, aún no compensa.`;
  }
  return "No se cumplen las condiciones de entrada.";
}
