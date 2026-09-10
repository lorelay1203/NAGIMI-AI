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

        const d = num(corto.delta);
        const popPct = d == null ? null : (1 - Math.min(Math.abs(d), 1)) * 100;
        const esperanza = popPct == null
          ? null
          : (popPct / 100) * credito - (1 - popPct / 100) * riesgoMax;

        const muro = lado === "call" ? callWall : putWall;
        const trasElMuro = muro == null
          ? false
          : lado === "call" ? vender >= muro : vender <= muro;

        const cabe = riesgoMax <= capital;
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
        });
      }
    }
  }

  // Orden: primero los que caben, luego los que están tras el muro, luego por
  // esperanza (lo que de verdad ganas a la larga), y al final por retorno.
  candidatos.sort((a, b) =>
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

  // La esperanza se mira sobre los que de verdad podrías poner.
  const mirar = caben.length > 0 ? caben : candidatos;
  const conEV = mirar.filter((c) => c.esperanza != null);
  if (conEV.length > 0 && conEV.every((c) => (c.esperanza as number) < 0)) {
    avisos.push(
      "Todos pierden dinero a la larga: ganas poco muchas veces y pierdes mucho de vez en cuando. "
      + "Si vas a entrar igual, que sea sabiendo que la cuenta no está a tu favor.",
    );
  }

  return avisos.length > 0 ? avisos.join(" ") : null;
}
