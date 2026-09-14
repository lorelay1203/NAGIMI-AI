// ============================================================================
// Venta de prima 0DTE con riesgo topado (spreads de crédito).
//
// El ticket que ya existía es para COMPRAR la vuelta al imán. Esto es lo
// contrario: cobrar por el tiempo, con la pérdida limitada por una pata
// comprada. La idea de Nagimi: vender SOLO más allá de los muros de gamma,
// que es donde el precio suele frenar.
//
// Regla que manda sobre todas: se cobra al BID y se compra al ASK. Nada de
// precios medios — el crédito que sale aquí es el peor caso realista, no el
// optimista. Fue justo eso lo que enseñó que un spread del SPX a las 3 PM
// pagaba $5 contra $495 de riesgo.
// ============================================================================

import type { TicketChainRow } from "./contractTicket";

const MULT = 100;

/** Un spread de crédito concreto, ya valorado contra la cuenta. */
export interface SpreadCandidate {
  lado: "call" | "put";
  /** Strike que vendes (cobras). */
  vender: number;
  /** Strike que compras (tu seguro). */
  comprar: number;
  ancho: number;
  /** Lo que cobras de verdad, en dólares por contrato. */
  credito: number;
  /** Lo máximo que puedes perder, en dólares por contrato. */
  riesgoMax: number;
  /** Cuánto te bloquea el bróker: aquí es lo mismo que el riesgo máximo. */
  colateral: number;
  /** Crédito ÷ riesgo, en %. Cuánto ganas por cada dólar arriesgado. */
  retornoPct: number;
  /** Probabilidad de que expire sin valor, de |delta| del strike vendido. */
  popPct: number | null;
  /** Ganancia media por operación a la larga. Negativa = te desangra. */
  esperanza: number | null;
  /** Distancia del strike vendido al precio, en %. */
  distanciaPct: number;
  /** El strike vendido está por fuera del muro de gamma. */
  trasElMuro: boolean;
  cabe: boolean;
  /** Si no cabe, cuánto falta. */
  faltan: number;
  /**
   * Sale ganando demasiado a la larga. Un spread vertical se cotiza casi a su
   * valor justo, así que en 0DTE esto casi siempre es un precio VIEJO en una
   * de las patas, no una oportunidad. Se muestra al final y con aviso.
   */
  sospechoso: boolean;
}

export interface CreditPlan {
  ticker: string;
  spot: number;
  regimen: "positive" | "negative";
  /** Aviso honesto que hay que leer ANTES de los candidatos. Null si no hay. */
  aviso: string | null;
  candidatos: SpreadCandidate[];
  /** Por qué se cayeron los demás, agrupado. */
  descartados: { motivo: string; n: number }[];
}

export interface CreditOpts {
  spot: number;
  callWall: number | null;
  putWall: number | null;
  regimen: "positive" | "negative";
  /** Dinero disponible, en dólares. */
  capital: number;
  /** Retorno mínimo aceptable (crédito ÷ riesgo) en %. */
  retornoMinPct?: number;
  /** Cuántos candidatos devolver. */
  max?: number;
}

/** Por debajo de esto, el crédito no compensa el colateral bloqueado. */
const RETORNO_MIN_PCT = 10;

/**
 * Ganancia a la larga, como fracción del ancho, a partir de la cual el spread
 * se marca sospechoso. Esperanza ÷ ancho = crédito ÷ ancho − prob. de perder, y
 * el mercado cotiza eso casi en cero; un 5% del ancho ya no es "suerte".
 */
const UMBRAL_SOSPECHA = 0.05;

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Separación típica entre strikes de la cadena (5 en SPX, 1 en SPY). */
export function pasoDeStrikes(strikes: number[]): number {
  const orden = [...new Set(strikes)].sort((a, b) => a - b);
  if (orden.length < 2) return 1;
  const gaps = orden.slice(1).map((s, i) => s - orden[i]).filter((g) => g > 0);
  if (gaps.length === 0) return 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]; // mediana: aguanta huecos sueltos
}

/**
 * Arma los spreads de crédito que tienen sentido hoy.
 *
 * Solo mira strikes MÁS ALLÁ del muro: vender calls por encima del muro de
 * calls, o puts por debajo del muro de puts. Vender dentro del rango es
 * apostar a que el precio no llegue a donde justamente suele ir.
 */
export function buildCreditPlan(
  ticker: string,
  rows: TicketChainRow[],
  opts: CreditOpts,
): CreditPlan {
  const { spot, callWall, putWall, regimen, capital } = opts;
  const retornoMin = opts.retornoMinPct ?? RETORNO_MIN_PCT;
  const max = opts.max ?? 6;

  const descartes = new Map<string, number>();
  const tira = (motivo: string) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + 1);

  const candidatos: SpreadCandidate[] = [];

  for (const lado of ["call", "put"] as const) {
    const patas = rows.filter((r) => r.type === lado);
    if (patas.length < 2) continue;

    const paso = pasoDeStrikes(patas.map((r) => r.strike));
    const porStrike = new Map(patas.map((r) => [r.strike, r]));
    const strikes = [...porStrike.keys()].sort((a, b) => a - b);

    // Anchos a probar: 1, 2, 3 y 5 pasos de la cadena.
    const anchos = [1, 2, 3, 5].map((k) => k * paso);

    for (const vender of strikes) {
      // El vendido tiene que estar FUERA del dinero: calls arriba, puts abajo.
      if (lado === "call" && vender <= spot) continue;
      if (lado === "put" && vender >= spot) continue;

      const corto = porStrike.get(vender);
      if (!corto) continue;
      const bid = num(corto.bid);
      if (bid == null || bid <= 0) { tira("nadie lo compra (bid en cero)"); continue; }

      for (const ancho of anchos) {
        const comprar = lado === "call" ? vender + ancho : vender - ancho;
        const largo = porStrike.get(comprar);
        if (!largo) continue;
        const ask = num(largo.ask);
        if (ask == null) continue;

        // Peor caso realista: vendes al bid, compras al ask.
        const credito = (bid - ask) * MULT;
        if (credito <= 0) { tira("no deja crédito, pagarías por entrar"); continue; }

        const riesgoMax = ancho * MULT - credito;
        if (riesgoMax <= 0) continue;

        const retornoPct = (credito / riesgoMax) * 100;
        if (retornoPct < retornoMin) { tira(`paga menos del ${retornoMin}% de lo que arriesga`); continue; }

        // Probabilidad sacada de los PRECIOS de los strikes vecinos (lo que el
        // mercado cobra de verdad). El delta queda solo de respaldo.
        const popPct = probVenceFuera(vender, paso, porStrike) ?? popDeDelta(num(corto.delta));
        const esperanza = popPct == null
          ? null
          : (popPct / 100) * credito - (1 - popPct / 100) * riesgoMax;

        const muro = lado === "call" ? callWall : putWall;
        const trasElMuro = muro == null
          ? false
          : lado === "call" ? vender >= muro : vender <= muro;

        const cabe = riesgoMax <= capital;
        const sospechoso = esperanza != null && esperanza > ancho * MULT * UMBRAL_SOSPECHA;
        candidatos.push({
          lado, vender, comprar, ancho,
          credito: Math.round(credito * 100) / 100,
          riesgoMax: Math.round(riesgoMax * 100) / 100,
          colateral: Math.round(riesgoMax * 100) / 100,
          retornoPct: Math.round(retornoPct * 10) / 10,
          popPct: popPct == null ? null : Math.round(popPct * 10) / 10,
          esperanza: esperanza == null ? null : Math.round(esperanza * 100) / 100,
          distanciaPct: Math.round((Math.abs(vender - spot) / spot) * 1000) / 10,
          trasElMuro,
          cabe,
          faltan: cabe ? 0 : Math.round((riesgoMax - capital) * 100) / 100,
          sospechoso,
        });
      }
    }
  }

  // Orden: los sospechosos al final (no se recomienda un precio viejo), luego
  // los que caben, los que están tras el muro, por esperanza (lo que de verdad
  // ganas a la larga), y al final por retorno.
  candidatos.sort((a, b) =>
    Number(a.sospechoso) - Number(b.sospechoso) ||
    Number(b.cabe) - Number(a.cabe) ||
    Number(b.trasElMuro) - Number(a.trasElMuro) ||
    (b.esperanza ?? -Infinity) - (a.esperanza ?? -Infinity) ||
    b.retornoPct - a.retornoPct,
  );

  return {
    ticker,
    spot,
    regimen,
    aviso: avisoDe(regimen, candidatos, capital),
    candidatos: candidatos.slice(0, max),
    descartados: [...descartes.entries()]
      .map(([motivo, n]) => ({ motivo, n }))
      .sort((a, b) => b.n - a.n),
  };
}

/**
 * Los avisos que hay que leer ANTES que cualquier número. Se acumulan: el
 * régimen y la esperanza son problemas distintos y pueden darse a la vez.
 * Antes se devolvía solo el primero, así que en gamma negativa nunca se
 * llegaba a decir que todos los candidatos perdían dinero a la larga.
 */
function avisoDe(
  regimen: "positive" | "negative",
  candidatos: SpreadCandidate[],
  capital: number,
): string | null {
  if (candidatos.length === 0) {
    return "Hoy no hay ningún spread que pague lo suficiente para lo que arriesga. "
      + "Cuando la prima ya se derritió, la única forma de cobrar algo es vender pegado al precio — y eso no es vender prima, es apostar.";
  }

  const avisos: string[] = [];
  const caben = candidatos.filter((c) => c.cabe);

  if (caben.length === 0) {
    const menor = candidatos.reduce((a, b) => (a.riesgoMax <= b.riesgoMax ? a : b));
    avisos.push(
      `Ninguno cabe en tus $${capital.toFixed(2)}. El más pequeño arriesga $${menor.riesgoMax.toFixed(2)} `
      + `y te faltarían $${menor.faltan.toFixed(2)}.`,
    );
  }

  if (regimen === "negative") {
    avisos.push(
      "El GEX está en gamma NEGATIVA: los movimientos se aceleran en vez de frenarse, "
      + "y vender prima necesita justo lo contrario. Los muros aguantan menos de lo normal en días así.",
    );
  }

  const sospechosos = candidatos.filter((c) => c.sospechoso);
  if (sospechosos.length > 0) {
    avisos.push(
      `${sospechosos.length === 1 ? "Un spread sale" : `${sospechosos.length} spreads salen`} ganando a la larga, `
      + "pero en 0DTE eso casi siempre es un precio VIEJO en una de las patas, no un regalo. "
      + "Están al final de la lista: confirma el bid y el ask en tu bróker antes de creerle.",
    );
  }

  // La esperanza se mira sobre los que de verdad podrías poner, sin contar los
  // sospechosos: un precio viejo no debe tapar que el resto pierde dinero.
  const limpios = candidatos.filter((c) => !c.sospechoso);
  const cabenLimpios = limpios.filter((c) => c.cabe);
  const mirar = cabenLimpios.length > 0 ? cabenLimpios : limpios;
  const conEV = mirar.filter((c) => c.esperanza != null);
  if (conEV.length > 0 && conEV.every((c) => (c.esperanza as number) < 0)) {
    avisos.push(
      "Todos pierden dinero a la larga: ganas poco muchas veces y pierdes mucho de vez en cuando. "
      + "Si vas a entrar igual, que sea sabiendo que la cuenta no está a tu favor.",
    );
  }

  return avisos.length > 0 ? avisos.join(" ") : null;
}

// ============================================================================
// El precio de VERDAD. Los niveles de MarketSnack llegan en velas de 5 minutos,
// y en 0DTE eso basta para que un strike "fuera del dinero" ya esté pegado al
// precio. Caso real QQQ (14-sep): niveles decían 710.25, las opciones en vivo
// decían 711.90, y el escáner mostró como ganador un spread que perdía dinero.
// ============================================================================

const mitad = (r: TicketChainRow): number | null => {
  const b = num(r.bid);
  const a = num(r.ask);
  if (b == null || a == null || b <= 0 || a < b) return null; // sin mercado o cruzado
  return (a + b) / 2;
};

/**
 * Precio del subyacente sacado de las mismas opciones (paridad put-call):
 * precio ≈ strike + call − put. Se usan los strikes más pegados al dinero (donde
 * call y put valen parecido) y la mediana, para que una pata rara no lo tuerza.
 * Interés y dividendos se ignoran: en horas o días no mueven ni un centavo.
 */
export function spotDeParidad(rows: TicketChainRow[]): number | null {
  const calls = new Map<number, number>();
  const puts = new Map<number, number>();
  for (const r of rows) {
    const m = mitad(r);
    if (m == null) continue;
    (r.type === "call" ? calls : puts).set(r.strike, m);
  }

  const pares: { dif: number; spot: number }[] = [];
  for (const [strike, c] of calls) {
    const p = puts.get(strike);
    if (p == null) continue;
    pares.push({ dif: Math.abs(c - p), spot: strike + c - p });
  }
  if (pares.length < 2) return null;

  pares.sort((a, b) => a.dif - b.dif);
  const cerca = pares.slice(0, 5).map((x) => x.spot).sort((a, b) => a - b);
  return cerca[Math.floor(cerca.length / 2)];
}

/** Desde qué desfase se le avisa a la usuaria que los niveles están atrasados. */
export const DESFASE_AVISO_PCT = 0.1;
/** Más allá de esto la paridad no es creíble (cadena rota): se usan los niveles. */
const DESFASE_MAX_PCT = 3;

export interface SpotElegido {
  spot: number;
  fuente: "cadena" | "niveles";
  /** Cuánto se separa el precio de las opciones del de los niveles, en %. */
  desfasePct: number | null;
  aviso: string | null;
}

/** Elige el precio con el que se arma el plan: el de la cadena si es creíble. */
export function elegirSpot(rows: TicketChainRow[], spotNiveles: number): SpotElegido {
  const paridad = spotDeParidad(rows);
  if (paridad == null || !(paridad > 0)) {
    return { spot: spotNiveles, fuente: "niveles", desfasePct: null, aviso: null };
  }
  if (!(spotNiveles > 0)) {
    return { spot: Math.round(paridad * 100) / 100, fuente: "cadena", desfasePct: null, aviso: null };
  }

  const desfasePct = ((paridad - spotNiveles) / spotNiveles) * 100;
  if (Math.abs(desfasePct) > DESFASE_MAX_PCT) {
    return { spot: spotNiveles, fuente: "niveles", desfasePct, aviso: null };
  }

  const aviso = Math.abs(desfasePct) >= DESFASE_AVISO_PCT
    ? `El precio de los niveles ($${spotNiveles.toFixed(2)}) viene atrasado: por las opciones en vivo, `
      + `el precio real anda en $${paridad.toFixed(2)} (${desfasePct >= 0 ? "+" : ""}${desfasePct.toFixed(2)}%). `
      + "Los números de abajo usan el precio real."
    : null;

  return { spot: Math.round(paridad * 100) / 100, fuente: "cadena", desfasePct, aviso };
}

/**
 * Probabilidad (en %) de que el strike vendido venza SIN valor, sacada de los
 * precios de las opciones vecinas — sin IV y sin modelo.
 *
 * Cuánto baja el precio de un call al subir el strike un escalón es,
 * exactamente, la probabilidad que el mercado le da a terminar por encima de
 * ese strike (en puts, al revés). Se usa esto y no Black-Scholes porque la IV
 * que manda la cadena para 0DTE no reproduce ni sus propios precios: el 14-sep
 * el SPX decía 8.7% y con eso un call de $2.72 "valía" $0.87. Con esa IV el
 * escáner veía ganadores que no existían.
 *
 * Usa el strike de abajo y el de arriba si están; si falta uno, el escalón que
 * quede. Devuelve null si no hay precios con qué medir.
 */
export function probVenceFuera(
  strike: number,
  paso: number,
  porStrike: Map<number, TicketChainRow>,
): number | null {
  const m = (k: number) => {
    const r = porStrike.get(k);
    return r ? mitad(r) : null;
  };
  const abajo = m(strike - paso);
  const aqui = m(strike);
  const arriba = m(strike + paso);

  let probDentro: number | null = null;
  if (abajo != null && arriba != null) probDentro = Math.abs(abajo - arriba) / (2 * paso);
  else if (aqui != null && arriba != null) probDentro = Math.abs(aqui - arriba) / paso;
  else if (abajo != null && aqui != null) probDentro = Math.abs(abajo - aqui) / paso;
  if (probDentro == null) return null;

  return (1 - Math.min(Math.max(probDentro, 0), 1)) * 100;
}

/** Respaldo cuando no hay precios vecinos: 1 − |delta| de la cadena. */
function popDeDelta(delta: number | null): number | null {
  return delta == null ? null : (1 - Math.min(Math.abs(delta), 1)) * 100;
}
