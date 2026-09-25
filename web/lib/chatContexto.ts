// ============================================================================
// Contexto del chat — el "de qué estamos hablando" que viaja con cada pregunta.
//
// El chat de Aetheris funciona porque está ACOTADO a un reporte: no es un
// ChatGPT genérico, es "pregúntale a ESTE análisis". Para lograr eso hay que
// mandarle al modelo los números que la página ya calculó, y solo esos.
//
// Por qué esta capa existe aparte del componente:
//   1. Si el contexto se armara dentro del JSX, cada cambio de diseño podría
//      romper en silencio lo que el modelo ve — y ahí es donde empieza a inventar.
//   2. Un dato que falta tiene que llegar como null Y aparecer en `faltantes`,
//      para que el modelo diga "no tengo ese dato" en vez de rellenarlo. Eso es
//      una regla del proyecto, y una regla se prueba; un JSX no.
//
// Nada de red, nada de disco: funciones puras.
//
// Nota sobre privacidad: aquí NO entra el saldo de la cuenta. El resto de
// Nagimi lo guarda solo en localStorage a propósito ("el saldo nunca llega al
// servidor", lib/risk.ts), y este chat sí sale a internet. Va el PORCENTAJE que
// su perfil deja arriesgar, que es lo que hace falta para responder bien.
// ============================================================================

import type { ProPrediction } from "./prediction";
import type { GexAnalysis } from "./gex";
import type { LevelsReport } from "./levels";
import { analogia } from "./analogia";

/**
 * Tope de preguntas por reporte. Aetheris pone 10 y se ve como "0/10 preguntas".
 * Aquí cumple dos funciones: no dispara el gasto de la API sin que ella se entere,
 * y empuja a preguntar lo importante en vez de conversar sin rumbo.
 */
export const LIMITE_PREGUNTAS = 10;

export type DireccionSimple = "sube" | "baja" | "lateral";

export interface EscenarioChat {
  objetivo: number;
  cambioPct: number;
  probabilidadPct: number;
  porQue: string;
}

/** Los muros de gamma tal como los publica el GEX en vivo de la página. */
export interface MurosGamma {
  callWall?: number | null;
  putWall?: number | null;
  magnet?: number | null;
  gammaFlip?: number | null;
}

export interface NivelChat {
  precio: number;
  porQue: string;
}

/** Lo único que el chat sabe del análisis. Si no está aquí, el modelo no lo sabe. */
export interface ContextoChat {
  ticker: string;
  precio: number | null;
  direccion: DireccionSimple | null;
  confianza: number | null;
  horizonteDias: number | null;
  /** Volatilidad implícita anual en % (18 = 18%). */
  ivPct: number | null;
  regimenGamma: "positiva" | "negativa" | null;
  /** La misma analogía que ya ve en el Veredicto — así el chat no la contradice. */
  analogiaDelDia: string | null;
  muroCalls: number | null;
  muroPuts: number | null;
  iman: number | null;
  flipGamma: number | null;
  soporteClave: NivelChat | null;
  resistenciaClave: NivelChat | null;
  escenarios: { bajista: EscenarioChat; base: EscenarioChat; alcista: EscenarioChat } | null;
  /** El aviso de la predicción (datos flojos, poca liquidez…), si lo hay. */
  avisoDatos: string | null;
  liquidezBaja: boolean | null;
  riesgoPorOperacionPct: number | null;
  /** Qué NO se pudo leer. Es la lista que evita que el modelo rellene huecos. */
  faltantes: string[];
}

export interface ContextoChatInput {
  ticker: string;
  prediction?: ProPrediction | null;
  gex?: GexAnalysis | null;
  levels?: LevelsReport | null;
  muros?: MurosGamma | null;
  riesgoPorOperacionPct?: number | null;
}

// --- ayudas de lectura ---------------------------------------------------

/** Un precio solo sirve si es un número real y mayor que cero. */
function precioValido(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}
/** Un porcentaje o un cambio sí puede ser 0 legítimamente, así que va aparte. */
function numeroValido(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const dinero = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;
const conSigno = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const DIRECCION: Record<"up" | "down" | "flat", DireccionSimple> = {
  up: "sube", down: "baja", flat: "lateral",
};

/** La dirección dicha como la diría ella, para meterla dentro de una pregunta. */
export function direccionEnPalabras(d: DireccionSimple): string {
  return d === "sube" ? "va para arriba" : d === "baja" ? "va para abajo" : "está lateral";
}

// --- 1. armar el contexto ------------------------------------------------

/**
 * Junta lo que la página ya calculó en el paquete que viaja con cada pregunta.
 * No calcula nada nuevo a propósito: si el chat dijera un número que la página
 * no muestra, ella no tendría forma de verificarlo.
 */
export function construirContextoChat(input: ContextoChatInput): ContextoChat {
  const { ticker, prediction, gex, levels, muros } = input;

  const precio = precioValido(prediction?.spot) ?? precioValido(gex?.spot) ?? precioValido(levels?.spot);
  const direccion = prediction?.direction ? DIRECCION[prediction.direction] : null;
  const confianza = numeroValido(prediction?.confidence);
  const iv = precioValido(gex?.iv) ?? precioValido(prediction?.iv);
  const regimen = gex?.regime === "positive" ? "positiva" : gex?.regime === "negative" ? "negativa" : null;

  // Los muros del GEX en vivo mandan sobre los estimados: son gamma de verdad,
  // no una aproximación por Black-Scholes. Si no llegaron, se cae a lo estimado.
  const iman = precioValido(muros?.magnet) ?? precioValido(gex?.kingStrike);
  const flip = precioValido(muros?.gammaFlip) ?? precioValido(gex?.flipStrike);
  const muroCalls = precioValido(muros?.callWall);
  const muroPuts = precioValido(muros?.putWall);

  const sup = levels?.keySupport ?? null;
  const res = levels?.keyResistance ?? null;

  // Si la predicción trae aviso, los escenarios NO se mandan. Es la misma regla
  // que usa el Panel para no pintar un objetivo con datos flojos: mejor "sin
  // dato" que un precio objetivo que suena firme y no lo es.
  const aviso = prediction?.caveat ?? null;
  const escenarios = prediction && !aviso
    ? {
        bajista: escenario(prediction.bear),
        base: escenario(prediction.base),
        alcista: escenario(prediction.bull),
      }
    : null;

  const faltantes: string[] = [];
  if (precio == null) faltantes.push("el precio actual");
  if (direccion == null) faltantes.push("la dirección que ve el agente");
  if (regimen == null) faltantes.push("si el día es de rango o de empujón");
  if (muroCalls == null && muroPuts == null) faltantes.push("los muros de calls y puts");
  if (iman == null) faltantes.push("el precio imán");
  if (sup == null && res == null) faltantes.push("los soportes y resistencias");
  if (escenarios == null) {
    faltantes.push(aviso
      ? `los escenarios de precio (el análisis los marcó poco fiables: ${aviso})`
      : "los escenarios de precio");
  }
  if (iv == null) faltantes.push("la volatilidad implícita");

  return {
    ticker,
    precio,
    direccion,
    confianza,
    horizonteDias: prediction ? prediction.horizonDays : null,
    ivPct: iv != null ? Math.round(iv * 1000) / 10 : null,
    regimenGamma: regimen,
    // La analogía solo se arma si hay de dónde: sin dirección ni régimen sería
    // una frase bonita sobre nada.
    analogiaDelDia: prediction?.direction || gex?.regime
      ? analogia(prediction?.direction ?? "flat", gex?.regime, confianza ?? 0)
      : null,
    muroCalls,
    muroPuts,
    iman,
    flipGamma: flip,
    soporteClave: sup ? { precio: sup.price, porQue: sup.why } : null,
    resistenciaClave: res ? { precio: res.price, porQue: res.why } : null,
    escenarios,
    avisoDatos: aviso,
    liquidezBaja: gex ? gex.lowLiquidity : null,
    riesgoPorOperacionPct: numeroValido(input.riesgoPorOperacionPct),
    faltantes,
  };
}

function escenario(s: { target: number; changePct: number; probability: number; driver: string }): EscenarioChat {
  return {
    objetivo: s.target,
    cambioPct: Math.round(s.changePct * 10) / 10,
    probabilidadPct: Math.round(s.probability * 100),
    porQue: s.driver,
  };
}

// --- 2. las preguntas de un clic ----------------------------------------

/**
 * Las 5 preguntas sugeridas. Siempre devuelve 5: si falta el dato que haría la
 * pregunta específica ("el muro de calls en $210"), baja a una versión general
 * en vez de inventarse el número. Todas son de OPCIONES, no de acciones — esta
 * app no hace fundamentales, y preguntar "¿está sobrevalorada?" solo daría humo.
 */
export function preguntasSugeridas(ctx: ContextoChat): string[] {
  const t = ctx.ticker;
  const preguntas: string[] = [];

  // 1) El muro: el concepto que más la confunde y el que más manda en el día.
  if (ctx.muroCalls != null) {
    preguntas.push(`¿Qué significa el muro de calls en ${dinero(ctx.muroCalls)} y qué pasa si ${t} llega ahí?`);
  } else if (ctx.muroPuts != null) {
    preguntas.push(`¿Qué significa el muro de puts en ${dinero(ctx.muroPuts)} y qué pasa si ${t} cae hasta ahí?`);
  } else if (ctx.resistenciaClave != null) {
    preguntas.push(`¿Qué tan fuerte es la resistencia de ${dinero(ctx.resistenciaClave.precio)} en ${t}?`);
  } else {
    preguntas.push(`¿Cuáles son los niveles que de verdad importan hoy en ${t}?`);
  }

  // 2) Comprar o vender prima: la decisión de fondo de cualquier trade de opciones.
  if (ctx.regimenGamma != null && ctx.ivPct != null) {
    preguntas.push(
      `Con gamma ${ctx.regimenGamma} y la volatilidad en ${ctx.ivPct}%, ¿me conviene comprar prima o venderla hoy en ${t}?`,
    );
  } else {
    preguntas.push(`¿Me conviene comprar prima o venderla hoy en ${t}, y por qué?`);
  }

  // 3) Qué puede salir mal: va siempre. Es lo que más se le olvida mirar a quien
  //    empieza, y lo único que el chat puede repetir sin cansar.
  preguntas.push(`¿Qué me puede salir mal si abro una operación de opciones en ${t} hoy?`);

  // 4) Por qué el agente dice lo que dice — le enseña a leer el reporte, no a obedecerlo.
  if (ctx.direccion != null) {
    const conf = ctx.confianza != null ? ` con ${Math.round(ctx.confianza)} de 100 de confianza` : "";
    preguntas.push(`¿Por qué el agente dice que ${t} ${direccionEnPalabras(ctx.direccion)}${conf}?`);
  } else {
    preguntas.push(`¿Por qué el agente no tiene una dirección clara en ${t} hoy?`);
  }

  // 5) Tamaño de la posición: su regla del 1% aplicada a ESTE análisis.
  if (ctx.riesgoPorOperacionPct != null) {
    preguntas.push(
      `Mi perfil solo deja arriesgar ${ctx.riesgoPorOperacionPct}% de la cuenta por operación. ¿Cómo aplico eso a una operación de ${t}?`,
    );
  } else {
    preguntas.push(`¿Cuánto debería arriesgar en una operación de ${t} si mi cuenta es chica?`);
  }

  return preguntas;
}

// --- 3. el contexto en español, para el prompt del sistema ---------------

const SIN_DATO = "sin dato";

/**
 * Convierte el contexto a texto plano en español. Se manda así y no como JSON
 * porque el modelo tiene que RESPONDER en este mismo lenguaje: si lee
 * "muroCalls: 210" contesta con jerga, y si lee "Muro de calls: $210" contesta
 * como la página. Además el "sin dato" queda escrito, no implícito.
 */
export function contextoATexto(ctx: Partial<ContextoChat> | null | undefined): string {
  if (!ctx || typeof ctx !== "object") return "No hay análisis cargado.";
  const l: string[] = [];
  const v = (n: number | null | undefined) => {
    const p = precioValido(n);
    return p != null ? dinero(p) : SIN_DATO;
  };

  l.push(`Ticker: ${ctx.ticker ?? SIN_DATO}`);
  l.push(`Precio actual: ${v(ctx.precio)}`);
  l.push(`Dirección que ve el agente: ${ctx.direccion ?? SIN_DATO}`);
  l.push(`Confianza (0-100): ${ctx.confianza != null ? Math.round(ctx.confianza) : SIN_DATO}`);
  l.push(`Horizonte del análisis: ${ctx.horizonteDias != null ? `${ctx.horizonteDias} días` : SIN_DATO}`);
  l.push(`Volatilidad implícita: ${ctx.ivPct != null ? `${ctx.ivPct}%` : SIN_DATO}`);
  l.push(`Régimen de gamma: ${ctx.regimenGamma ?? SIN_DATO}`);
  l.push(`Muro de calls (techo): ${v(ctx.muroCalls)}`);
  l.push(`Muro de puts (piso): ${v(ctx.muroPuts)}`);
  l.push(`Precio imán: ${v(ctx.iman)}`);
  l.push(`Flip de gamma: ${v(ctx.flipGamma)}`);
  l.push(`Soporte clave: ${ctx.soporteClave ? `${dinero(ctx.soporteClave.precio)} — ${ctx.soporteClave.porQue}` : SIN_DATO}`);
  l.push(`Resistencia clave: ${ctx.resistenciaClave ? `${dinero(ctx.resistenciaClave.precio)} — ${ctx.resistenciaClave.porQue}` : SIN_DATO}`);

  if (ctx.escenarios) {
    const e = ctx.escenarios;
    l.push(
      "Escenarios a ese horizonte:"
      + `\n  - Bajista: ${dinero(e.bajista.objetivo)} (${conSigno(e.bajista.cambioPct)}, ${e.bajista.probabilidadPct}% de probabilidad) — ${e.bajista.porQue}`
      + `\n  - Base: ${dinero(e.base.objetivo)} (${conSigno(e.base.cambioPct)}, ${e.base.probabilidadPct}% de probabilidad) — ${e.base.porQue}`
      + `\n  - Alcista: ${dinero(e.alcista.objetivo)} (${conSigno(e.alcista.cambioPct)}, ${e.alcista.probabilidadPct}% de probabilidad) — ${e.alcista.porQue}`,
    );
  } else {
    l.push(`Escenarios a ese horizonte: ${SIN_DATO}`);
  }

  if (ctx.analogiaDelDia) l.push(`Analogía que ella ya vio en el Veredicto: ${ctx.analogiaDelDia}`);
  if (ctx.avisoDatos) l.push(`AVISO del análisis: ${ctx.avisoDatos}`);
  if (ctx.liquidezBaja) l.push("AVISO: este ticker tiene poca liquidez en opciones (spreads anchos, difícil salir).");
  l.push(`Riesgo máximo por operación según su perfil: ${ctx.riesgoPorOperacionPct != null ? `${ctx.riesgoPorOperacionPct}% de la cuenta` : SIN_DATO}`);
  l.push("Tamaño de su cuenta: no disponible (se queda en su computadora, nunca sale de ahí).");

  if (ctx.faltantes && ctx.faltantes.length > 0) {
    l.push(
      `DATOS QUE NO SE PUDIERON LEER (nunca los inventes, di que no están): ${ctx.faltantes.join("; ")}.`,
    );
  }

  return l.join("\n");
}
