// ============================================================================
// "Tus próximos pasos" — la lectura técnica del análisis, traducida a una
// lista corta de acciones concretas, en el mismo lenguaje llano que usa
// Aetheris/FinAnalista ("pon una alerta en $X, si llega ahí podría ser buen
// momento para...") pero con los números REALES que Nagimi ya calculó — nunca
// genéricos, nunca inventados. Si un dato no está, ese paso simplemente no sale.
// ============================================================================

import type { ProPrediction } from "./prediction";
import type { LevelsReport } from "./levels";
import type { GexAnalysis } from "./gex";
import type { DaySession } from "./sessionDay";
import type { AffordableCandidate } from "./wheelAfford";
import type { Move } from "./bigMoney";
import type { FlowRow, AggressionScore } from "./flow";
import type { WatchlistEntry } from "./watchlist";

export interface NextStep {
  id: string;
  /** La acción en una frase, lista para leer — sin tecnicismos. */
  texto: string;
  /** Por qué, en un fragmento corto (opcional, se ve en gris debajo). */
  motivo?: string;
  tipo: "alerta" | "meta" | "riesgo" | "fecha";
}

const money = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
/** Redondea a entero salvo que quede en "0%" siendo distinto de cero — ahí se ve como "<1%". */
const pctDist = (n: number) => (Math.abs(n) > 0 && Math.round(Math.abs(n)) === 0 ? "<1" : String(Math.round(Math.abs(n))));
/** Para valores de cartera (miles de millones) — $37.8B, no $37764088383. */
const bigMoney = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

/**
 * Arma la lista de pasos a partir de lo que YA calculó el resto de Nagimi
 * (predicción, soportes/resistencias, GEX). Pura: sin red, fácil de probar.
 */
export function buildNextSteps(
  ticker: string,
  prediction: ProPrediction | null,
  levels: LevelsReport | null,
  gex: GexAnalysis | null,
): NextStep[] {
  const steps: NextStep[] = [];
  const spot = prediction?.spot ?? levels?.spot ?? gex?.spot ?? 0;
  if (!(spot > 0)) return steps;

  // 1) Alerta de precio en el soporte más fuerte — "si cae hasta aquí, mira de comprar".
  const sup = levels?.keySupport;
  if (sup && sup.price < spot) {
    const dist = pctDist(((spot - sup.price) / spot) * 100);
    steps.push({
      id: "alerta-soporte",
      tipo: "alerta",
      texto: `Pon una alerta de precio en ${money(sup.price)} (${dist}% abajo del precio actual). Si ${ticker} cae hasta ahí, podría ser un buen punto para mirar de comprar.`,
      motivo: sup.why,
    });
  }

  // 2) Meta de ganancia en la resistencia más fuerte — "si sube hasta aquí, decide si vendes".
  const res = levels?.keyResistance;
  if (res && res.price > spot) {
    const dist = pctDist(((res.price - spot) / spot) * 100);
    steps.push({
      id: "meta-resistencia",
      tipo: "meta",
      texto: `Considera una meta de ganancia en ${money(res.price)} (${dist}% arriba). Decide desde ahora si vendes parte ahí o te quedas por más.`,
      motivo: res.why,
    });
  }

  // 3) El escenario alcista de la predicción, si trae más detalle que la resistencia.
  if (prediction?.bull && Math.abs(prediction.bull.changePct) > 1) {
    steps.push({
      id: "escenario-alcista",
      tipo: "meta",
      texto: `Si ${ticker} sigue subiendo, el escenario más optimista de Nagimi apunta a ${money(prediction.bull.target)} (${pct(prediction.bull.changePct)}) en los próximos ${prediction.horizonDays} días.`,
      motivo: prediction.bull.driver,
    });
  }

  // 4) El riesgo del escenario bajista.
  if (prediction?.bear && Math.abs(prediction.bear.changePct) > 1) {
    steps.push({
      id: "escenario-bajista",
      tipo: "riesgo",
      texto: `El riesgo a vigilar: si el mercado gira, ${ticker} podría caer hasta ${money(prediction.bear.target)} (${pct(prediction.bear.changePct)}) en ${prediction.horizonDays} días.`,
      motivo: prediction.bear.driver,
    });
  }

  // 5) Régimen de gamma — qué tipo de movimiento esperar hoy.
  if (gex?.regime && gex.kingStrike != null) {
    steps.push(
      gex.regime === "positive"
        ? {
            id: "gex-regimen",
            tipo: "riesgo",
            texto: `Hoy el mercado está en gamma positiva: tiende a moverse poco y volver hacia ${money(gex.kingStrike)}. No esperes un movimiento grande de un solo golpe.`,
          }
        : {
            id: "gex-regimen",
            tipo: "riesgo",
            texto: `Hoy el mercado está en gamma negativa: los movimientos pueden acelerarse más de lo normal, en cualquier dirección. Ten el stop más ancho de lo usual.`,
          },
    );
  }

  // 6) Aviso de baja confianza — para no seguir un análisis flojo a ciegas.
  if (prediction && prediction.confidence < 40 && prediction.active > 0) {
    steps.push({
      id: "confianza-baja",
      tipo: "riesgo",
      texto: `La confianza de este análisis es baja (${prediction.confidence}/100) — hay poca información clara todavía. Trátalo como una primera mirada, no como una señal fuerte.`,
    });
  }

  return steps;
}

/**
 * Igual que buildNextSteps, pero para la sesión de HOY (Day Trades): el
 * horizonte es horas, no semanas, así que los pasos hablan de niveles intradía
 * (VWAP, muros de gamma, rango de apertura) en vez de escenarios a 10-30 días.
 */
export function buildSessionNextSteps(session: DaySession): NextStep[] {
  const steps: NextStep[] = [];
  const { price } = session;
  if (!(price > 0)) return steps;

  // 1) Muro de puts (soporte del día) — "si cae hasta aquí, ahí suele rebotar".
  if (session.putWall != null && session.putWall < price) {
    const dist = pctDist(session.putWallDeltaPct ?? ((price - session.putWall) / price) * 100);
    steps.push({
      id: "alerta-putwall",
      tipo: "alerta",
      texto: `Pon una alerta en ${money(session.putWall)} (${dist}% abajo) — es el muro de puts de hoy. El precio suele frenar la caída o rebotar ahí.`,
    });
  }

  // 2) Muro de calls (resistencia del día) — "si sube hasta aquí, ahí suele frenar".
  if (session.callWall != null && session.callWall > price) {
    const dist = pctDist(session.callWallDeltaPct ?? ((session.callWall - price) / price) * 100);
    steps.push({
      id: "alerta-callwall",
      tipo: "alerta",
      texto: `Pon una alerta en ${money(session.callWall)} (${dist}% arriba) — es el muro de calls de hoy. El precio suele frenar la subida ahí.`,
    });
  }

  // 3) El imán — hacia dónde jala el precio si el régimen es de rango.
  if (session.magnet != null && session.regime === "positive") {
    const dif = session.magnet - price;
    if (Math.abs(dif) / price * 100 >= 0.15) { // no repetir si ya está prácticamente ahí
      steps.push({
        id: "iman-hoy",
        tipo: "meta",
        texto: `Con gamma positiva, hoy el precio tiende a volver hacia el imán en ${money(session.magnet)} (${dif > 0 ? "arriba" : "abajo"} del precio actual).`,
      });
    }
  }

  // 4) Ruptura del rango de apertura — nivel a vigilar los primeros 30 min ya cerrados.
  if (session.openRangeClosed && session.openRangeHigh != null && session.openRangeLow != null) {
    steps.push({
      id: "rango-apertura",
      tipo: "alerta",
      texto: `El rango de los primeros 30 min quedó entre ${money(session.openRangeLow)} y ${money(session.openRangeHigh)}. Romper por arriba o por abajo de ahí suele marcar el tono del resto del día.`,
    });
  }

  // 5) Posición frente al VWAP — a favor o en contra de la tendencia del día.
  if (session.vwap != null && session.vwapDelta != null && Math.abs(session.vwapDelta) / session.vwap * 100 >= 0.1) {
    const arriba = session.vwapDelta > 0;
    steps.push({
      id: "vwap-hoy",
      tipo: arriba ? "meta" : "riesgo",
      texto: `El precio está ${arriba ? "por encima" : "por debajo"} del VWAP (${money(session.vwap)}) — ${arriba ? "confirma fuerza compradora" : "confirma presión vendedora"} en lo que va del día.`,
    });
  }

  // 6) El régimen, en la misma frase que ya arma sessionDay (ya está en llano).
  if (session.regimeNote) {
    steps.push({ id: "regimen-hoy", tipo: "riesgo", texto: session.regimeNote });
  }

  return steps;
}

/**
 * Igual que las anteriores, pero para "Sigue a los Grandes": aquí no hay un
 * veredicto ni un candidato con precio — hay una LISTA de jugadas de un
 * inversor (13F). Los pasos priorizan CUÁL mirar primero: la compra nueva o
 * el aumento más grande, y cualquier salida completa como aviso.
 */
export function buildGrandesNextSteps(investor: string, moves: Move[]): NextStep[] {
  const steps: NextStep[] = [];
  const conTicker = moves.filter((m) => m.ticker);

  const salidas = conTicker.filter((m) => m.kind === "salida");

  // 1) La jugada más fuerte: la de MAYOR VALOR entre compras nuevas y aumentos —
  // no se prefiere "nueva" por defecto, porque a veces es una posición trivial
  // (unos cientos de dólares) al lado de un aumento de miles de millones.
  const candidatas = conTicker
    .filter((m) => m.kind === "nueva" || m.kind === "aumento")
    .sort((a, b) => b.value - a.value);
  const destacada = candidatas[0];
  if (destacada) {
    const esNueva = destacada.kind === "nueva";
    steps.push({
      id: "grandes-destacada",
      tipo: "alerta",
      texto: esNueva
        ? `${investor} abrió una posición NUEVA en ${destacada.ticker} — ${bigMoney(destacada.value)} (${destacada.pctOfPortfolio.toFixed(1)}% de su cartera). De las jugadas de este reporte, la de más peso.`
        : `${investor} AUMENTÓ ${destacada.ticker} ${destacada.changePct != null ? pct(destacada.changePct) : ""} — ahora ${bigMoney(destacada.value)} (${destacada.pctOfPortfolio.toFixed(1)}% de su cartera).`,
      motivo: "Toca el ticker para analizarlo y ver contratos en la misma dirección.",
    });
  }

  // 2) Segunda jugada relevante, si hay otra distinta a la destacada.
  const segunda = candidatas.find((m) => m !== destacada);
  if (segunda) {
    steps.push({
      id: "grandes-segunda",
      tipo: "meta",
      texto: segunda.kind === "nueva"
        ? `También abrió posición en ${segunda.ticker} (${bigMoney(segunda.value)}, ${segunda.pctOfPortfolio.toFixed(1)}% de su cartera).`
        : `También aumentó ${segunda.ticker} ${segunda.changePct != null ? pct(segunda.changePct) : ""}.`,
    });
  }

  // 3) Salidas completas — si la tienes, vale la pena preguntarte por qué él ya no.
  if (salidas.length > 0) {
    const nombres = salidas.slice(0, 3).map((m) => m.ticker).join(", ");
    steps.push({
      id: "grandes-salidas",
      tipo: "riesgo",
      texto: `${investor} vendió TODO en: ${nombres}${salidas.length > 3 ? ` y ${salidas.length - 3} más` : ""}. Si tienes alguna de estas, vale la pena preguntarte por qué él ya salió.`,
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "grandes-sin-cambios",
      tipo: "riesgo",
      texto: `${investor} no muestra compras nuevas ni aumentos grandes en este reporte — mantuvo su cartera prácticamente igual.`,
    });
  }

  return steps;
}

/**
 * Igual que las anteriores, pero para el escáner del Wheel: en vez de un
 * ticker, hay una LISTA de candidatos ya ordenados (los que caben en tu
 * dinero primero, por mejor puntaje). Los pasos hablan del mejor candidato
 * real y de cuántos más cupieron — nunca inventan uno.
 */
export function buildWheelNextSteps(rows: AffordableCandidate[], cash: number): NextStep[] {
  const steps: NextStep[] = [];
  const operables = rows.filter((r) => !r.blocked);
  if (operables.length === 0) return steps;

  const cabenTotal = operables.filter((r) => r.afford.affordable);
  const mejor = cabenTotal[0];

  // 1) El mejor candidato que SÍ cabe — la acción concreta de hoy.
  if (mejor && mejor.metrics) {
    const m = mejor.metrics;
    const spread = mejor.longStrike != null;
    const patas = spread
      ? `vende el put ${mejor.strike} y compra el put ${mejor.longStrike} de protección`
      : `vende el put ${mejor.strike} (cash-secured)`;
    steps.push({
      id: "wheel-mejor",
      tipo: "alerta",
      texto: `Tu mejor opción hoy: en ${mejor.ticker}, ${patas} · vence ${mejor.expiration} (${mejor.dte} días). `
        + `Cobras ${money(m.credit)}, pones ${money(m.collateral)} de tu dinero, y el retorno anualizado es ${pct(m.annualizedPct)}.`,
      motivo: `${Math.round(m.probExpireWorthless)}% de probabilidad de que expire sin valor (te quedas con la prima completa).`,
    });

    // 2) El punto de equilibrio — desde dónde empieza a doler si te asignan.
    if (m.breakeven > 0) {
      steps.push({
        id: "wheel-breakeven",
        tipo: "riesgo",
        texto: `Si te asignan las acciones, tu costo real queda en ${money(m.breakeven)}. Solo pierdes si ${mejor.ticker} termina por debajo de ahí.`,
      });
    }
  }

  // 3) Cuántos más caben, para que sepa que hay variedad — o que no la hay.
  if (cabenTotal.length > 1) {
    steps.push({
      id: "wheel-variedad",
      tipo: "meta",
      texto: `Además de esa, tienes ${cabenTotal.length - 1} candidato${cabenTotal.length - 1 === 1 ? "" : "s"} más que caben en tus ${money(cash)} — revisa la tabla completa antes de decidir.`,
    });
  } else if (cabenTotal.length === 0) {
    const masBarato = operables.slice().sort((a, b) => (a.metrics?.collateral ?? Infinity) - (b.metrics?.collateral ?? Infinity))[0];
    steps.push({
      id: "wheel-sin-alcance",
      tipo: "riesgo",
      texto: masBarato?.metrics
        ? `Ninguno de los candidatos de hoy cabe en tus ${money(cash)}. El más barato (${masBarato.ticker}) pide ${money(masBarato.metrics.collateral)} de colateral — te faltarían ${money(masBarato.afford.shortfall)}.`
        : `Ninguno de los candidatos de hoy cabe en tus ${money(cash)}.`,
    });
  }

  return steps;
}

/** Días desde hoy hasta una fecha "YYYY-MM-DD". null si la fecha no sirve. */
function diasHasta(expiration: string | null, now: Date): number | null {
  if (!expiration) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiration);
  if (!m) return null;
  const exp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((exp - hoy) / 86_400_000);
}

/** Lo mínimo del screener de Ideas — evita acoplar lib/ a los tipos de app/ideas. */
export interface SizedIdeaLike {
  idea: {
    ticker: string;
    type: "call" | "put";
    strike: number | null;
    expiration: string | null;
    dte: number | null;
    price: number;
    thetaPctDaily: number | null;
    repeated: boolean;
    history: { hitRate: number | null; medianSessions: number | null; resolved: number } | null;
  };
  sizing: {
    maxContracts: number;
    costPerContract: number;
    blocked: { reason: string; detail: string } | null;
  };
}

/**
 * Igual que las anteriores, pero para el screener de Ideas: aquí hay una LISTA
 * de contratos ya dimensionados contra tu cuenta. Los pasos hablan del mejor
 * que SÍ cabe, de lo que ha pasado históricamente con flujos parecidos, y del
 * theta — que en contratos comprados es lo que más dinero se lleva en silencio.
 */
export function buildIdeasNextSteps(rows: SizedIdeaLike[], presupuesto?: number): NextStep[] {
  const steps: NextStep[] = [];
  if (rows.length === 0) return steps;

  const caben = rows.filter((r) => !r.sizing.blocked && r.sizing.maxContracts > 0);
  const mejor = caben[0];

  // 1) La idea concreta de hoy — la que cabe y más dinero grande movió.
  if (mejor) {
    const i = mejor.idea;
    const tipo = i.type === "call" ? "CALL (apuesta a que sube)" : "PUT (apuesta a que baja)";
    const strike = i.strike != null ? ` de strike ${i.strike}` : "";
    const vence = i.expiration
      ? ` que vence el ${i.expiration}${i.dte != null ? ` (en ${i.dte} día${i.dte === 1 ? "" : "s"})` : ""}`
      : "";
    steps.push({
      id: "ideas-mejor",
      tipo: "alerta",
      texto: `Tu mejor idea hoy: en ${i.ticker}, un ${tipo}${strike}${vence}. `
        + `Cada contrato cuesta ${money(mejor.sizing.costPerContract)} y en tu cuenta caben hasta ${mejor.sizing.maxContracts}.`,
      motivo: "Es la que más dinero grande movió entre las que sí te alcanzan.",
    });

    // 2) Qué ha pasado antes con flujos parecidos en ese mismo ticker.
    const h = i.history;
    if (h && h.hitRate != null && h.resolved >= 3) {
      const tarde = h.medianSessions != null
        ? ` y la mediana tardó ${h.medianSessions} ${h.medianSessions === 1 ? "sesión" : "sesiones"} en desarrollarse`
        : "";
      steps.push({
        id: "ideas-historial",
        tipo: "meta",
        texto: `En ${i.ticker}, ${Math.round(h.hitRate)}% de los flujos parecidos acabaron moviéndose a favor (sobre ${h.resolved} casos ya vencidos)${tarde}.`,
        motivo: "Historial, no garantía — dice cómo se han comportado, no cómo se comportará este.",
      });
    }

    // 3) El theta — lo que pierdes cada día aunque aciertes la dirección.
    if (i.thetaPctDaily != null && i.thetaPctDaily >= 3) {
      steps.push({
        id: "ideas-theta",
        tipo: "riesgo",
        texto: `Ese contrato pierde alrededor de ${Math.round(i.thetaPctDaily)}% de su valor cada día solo por el paso del tiempo. `
          + `Si la idea no se mueve en pocos días, pierdes dinero aunque no te equivoques de dirección.`,
      });
    }

    // 4) Repetición — señal de que alguien insiste, no una operación suelta.
    if (i.repeated) {
      steps.push({
        id: "ideas-repetido",
        tipo: "meta",
        texto: `Ese mismo contrato apareció varias veces hoy: alguien está insistiendo, no fue una sola operación suelta.`,
      });
    }
  }

  // 5) Variedad — o la falta de ella, con el precio real del más barato.
  if (caben.length > 1) {
    steps.push({
      id: "ideas-variedad",
      tipo: "meta",
      texto: `Además de esa, tienes ${caben.length - 1} idea${caben.length - 1 === 1 ? "" : "s"} más que caben en tu cuenta — revisa la tabla antes de decidir.`,
    });
  } else if (caben.length === 0) {
    const barata = rows.slice().sort((a, b) => a.sizing.costPerContract - b.sizing.costPerContract)[0];
    steps.push({
      id: "ideas-sin-alcance",
      tipo: "riesgo",
      texto: barata && barata.sizing.costPerContract > 0
        ? `Ninguna de las ${rows.length} ideas de hoy cabe en tu cuenta. La más barata es ${barata.idea.ticker} a ${money(barata.sizing.costPerContract)} por contrato.`
        : `Ninguna de las ${rows.length} ideas de hoy cabe en tu cuenta con tu perfil de riesgo actual.`,
      // El tope no es el dinero que tienes, es el % que tu perfil deja arriesgar
      // por operación. Sin esta línea parece un error de la app.
      motivo: presupuesto != null && presupuesto > 0
        ? `No es que te falte dinero: tu perfil solo deja arriesgar ${money(presupuesto)} por operación. Si quieres ver ideas que sí quepan, sube el % de riesgo en tu perfil de arriba.`
        : undefined,
    });
  }

  return steps;
}

/**
 * Igual que las anteriores, pero para Time & Sales (Flujo): aquí no hay
 * predicción ni candidato — hay las operaciones GRANDES que ya ocurrieron.
 * Los pasos traducen hacia qué lado entró el dinero, cuál fue la operación
 * más pesada, y avisan de lo que ya venció (que sirve de historia, no para hoy).
 */
export function buildFlowNextSteps(ticker: string, rows: FlowRow[], score: AggressionScore): NextStep[] {
  const steps: NextStep[] = [];
  if (rows.length === 0) return steps;

  // 1) Hacia qué lado entró el dinero grande — la lectura principal de la página.
  const denom = score.premiumAsk + score.premiumBid;
  if (denom > 0) {
    const pctAsk = Math.round((100 * score.premiumAsk) / denom);
    steps.push(
      pctAsk >= 66
        ? {
            id: "flow-direccion",
            tipo: "alerta",
            texto: `El ${pctAsk}% del dinero grande de hoy en ${ticker} entró pagando el ask: compra agresiva. Mientras siga así, empuja el precio hacia arriba.`,
            motivo: `${bigMoney(score.premiumAsk)} comprando contra ${bigMoney(score.premiumBid)} vendiendo.`,
          }
        : pctAsk <= 34
        ? {
            id: "flow-direccion",
            tipo: "riesgo",
            texto: `El ${100 - pctAsk}% del dinero grande de hoy en ${ticker} salió golpeando el bid: venta agresiva. Es presión hacia abajo — ten cuidado con comprar aquí.`,
            motivo: `${bigMoney(score.premiumBid)} vendiendo contra ${bigMoney(score.premiumAsk)} comprando.`,
          }
        : {
            id: "flow-direccion",
            tipo: "riesgo",
            texto: `Hoy en ${ticker} el dinero grande está repartido: ${pctAsk}% entró comprando y ${100 - pctAsk}% salió vendiendo. Por cada uno que entra hay otro que sale, así que nadie está empujando el precio con fuerza.`,
          },
    );
  }

  // 2) Reparto calls vs puts — la otra mitad de la lectura, en dinero real.
  const premCalls = rows.filter((r) => r.type === "call").reduce((a, r) => a + r.premium, 0);
  const premPuts = rows.filter((r) => r.type === "put").reduce((a, r) => a + r.premium, 0);
  if (premCalls + premPuts > 0) {
    const masCalls = premCalls >= premPuts;
    // Ojo: esto NO es lo mismo que el paso de arriba. Arriba es QUIÉN EMPUJA
    // (compra agresiva vs venta agresiva); aquí es HACIA DÓNDE APUESTAN
    // (calls vs puts). Pueden no coincidir, y cuando no coinciden hay que
    // decirlo — si no, se leen como si uno contradijera al otro.
    const inclinado = Math.max(premCalls, premPuts) / (premCalls + premPuts) >= 0.65;
    const repartido = denom > 0 && (100 * score.premiumAsk) / denom > 34 && (100 * score.premiumAsk) / denom < 66;
    steps.push({
      id: "flow-calls-puts",
      tipo: "meta",
      texto: `Hacia dónde apuestan: ${bigMoney(premCalls)} en calls (a que sube) y ${bigMoney(premPuts)} en puts (a que baja). `
        + `Pesan más los ${masCalls ? "calls" : "puts"}.`,
      motivo: inclinado && repartido
        ? `Que casi todo esté en ${masCalls ? "calls" : "puts"} no contradice lo de arriba: ahí se mide quién empuja, y hay tanto quien abre posición como quien la cierra.`
        : undefined,
    });
  }

  // 3) La operación más pesada — la que más mueve la lectura de arriba.
  const grande = rows.slice().sort((a, b) => b.premium - a.premium)[0];
  if (grande && grande.premium > 0 && grande.type !== "unknown") {
    const strike = grande.strike != null ? ` ${grande.strike}` : "";
    const vence = grande.expiration ? ` que vence el ${grande.expiration}` : "";
    steps.push({
      id: "flow-mayor",
      tipo: "meta",
      texto: `La operación más grande: ${grande.size} contrato${grande.size === 1 ? "" : "s"} de ${grande.type === "call" ? "CALL" : "PUT"}${strike}${vence}, ${bigMoney(grande.premium)} en prima.`,
      motivo: "Es la que más peso tiene en todo lo de arriba.",
    });
  }

  // 4) Lo que ya venció — historia útil, pero no se puede entrar ahí hoy.
  const expirados = rows.filter((r) => r.expiryStatus === "expirado").length;
  if (expirados > 0) {
    steps.push({
      id: "flow-expirados",
      tipo: "fecha",
      texto: `Ojo: ${expirados} de estas operaciones son de contratos que YA vencieron. Sirven para entender qué pasó, no para entrar hoy.`,
    });
  }

  // 5) Los 0DTE — vencen hoy y valen $0 al cierre si no aciertan.
  const hoy = rows.filter((r) => r.expiryStatus === "expira_hoy").length;
  if (hoy > 0) {
    steps.push({
      id: "flow-0dte",
      tipo: "fecha",
      texto: `${hoy} son de contratos que vencen HOY: se mueven rapidísimo y valen $0 al cierre si el precio no llega. No es donde empezar.`,
    });
  }

  return steps;
}

/**
 * Igual que las anteriores, pero para tu Watchlist: aquí lo que importa es el
 * CALENDARIO. Un contrato guardado se vence solo, y el theta sigue corriendo
 * aunque no lo mires. Solo se usa la foto del momento en que lo marcaste —
 * no se inventa un precio actual que la página no tiene.
 */
export function buildWatchlistNextSteps(entries: WatchlistEntry[], now: Date): NextStep[] {
  const steps: NextStep[] = [];
  if (entries.length === 0) return steps;

  const conDias = entries.map((e) => ({ e, dias: diasHasta(e.expiration, now) }));

  // 1) Lo que ya venció — ocupa espacio y ensucia la lista.
  const vencidos = conDias.filter((x) => x.dias != null && x.dias < 0);
  if (vencidos.length > 0) {
    const nombres = [...new Set(vencidos.map((x) => x.e.ticker))].slice(0, 3).join(", ");
    steps.push({
      id: "wl-vencidos",
      tipo: "fecha",
      texto: `${vencidos.length} contrato${vencidos.length === 1 ? "" : "s"} de tu lista ya venció (${nombres}). Quítalo${vencidos.length === 1 ? "" : "s"} para que la lista muestre solo lo que sigue vivo.`,
    });
  }

  // 2) El que vence primero — la única fecha que de verdad te corre.
  const vivos = conDias
    .filter((x): x is { e: WatchlistEntry; dias: number } => x.dias != null && x.dias >= 0)
    .sort((a, b) => a.dias - b.dias);
  const proximo = vivos[0];
  if (proximo) {
    const e = proximo.e;
    const nombre = `${e.type === "call" ? "CALL" : "PUT"}${e.strike != null ? ` ${e.strike}` : ""} de ${e.ticker}`;
    steps.push({
      id: "wl-proximo",
      tipo: "fecha",
      texto: proximo.dias === 0
        ? `El ${nombre} vence HOY. Decide ya: o entras, o lo quitas de la lista.`
        : `Lo que vence primero es el ${nombre}: en ${proximo.dias} día${proximo.dias === 1 ? "" : "s"} (${e.expiration}). Decide antes de esa fecha.`,
    });
  }

  // 3) El que más rápido se derrite — theta del momento en que lo marcaste.
  const quemon = entries
    .filter((e) => e.entryThetaPctDaily != null && e.entryThetaPctDaily >= 3)
    .sort((a, b) => (b.entryThetaPctDaily ?? 0) - (a.entryThetaPctDaily ?? 0))[0];
  if (quemon?.entryThetaPctDaily != null) {
    steps.push({
      id: "wl-theta",
      tipo: "riesgo",
      texto: `El de ${quemon.ticker} es el que más rápido pierde valor: cuando lo marcaste se derretía ~${Math.round(quemon.entryThetaPctDaily)}% al día. `
        + `Si lleva días ahí guardado, hoy vale bastante menos que cuando lo viste.`,
    });
  }

  // 4) Recordatorio de que son fotos viejas, no precios de ahora.
  if (vivos.length > 0) {
    steps.push({
      id: "wl-refrescar",
      tipo: "meta",
      texto: `Los precios que ves aquí son del momento en que marcaste cada contrato, no los de ahora. Antes de entrar en cualquiera, confirma el precio en tu bróker.`,
    });
  }

  return steps;
}
