// ============================================================================
// Contratos que caben en una cuenta chica (el Reto Webull).
//
// Con $10 sí caben opciones: contratos baratos y lejanos de $0.02-$0.10. Así
// fue como Lorelay subió Robinhood de $10 a $3,000. No es lo "seguro", pero es
// real y es su decisión — Nagimi le enseña lo que cabe y le dice la verdad:
// cuánto cuesta, qué tan probable es y cuánto pagaría si el precio llega a la
// meta del día (el imán de los muros).
//
// Todo PURO: la cadena y los niveles entran como datos.
// ============================================================================

import type { TicketChainRow } from "./contractTicket";

export interface Barato {
  ticker: string;
  type: "call" | "put";
  strike: number;
  expiration: string | null;
  bid: number;
  ask: number;
  /** Lo que cuesta 1 contrato (al ask), en $. */
  costo: number;
  /** Cuántos contratos caben con el saldo. */
  contratos: number;
  /** Probabilidad aproximada de terminar en el dinero (de la delta), en %. */
  probPct: number | null;
  spot: number;
  /** Hasta dónde va la idea (el imán del día). */
  meta: number;
  /** Cuánto se tiene que mover el precio para llegar al strike, en %. */
  distanciaPct: number;
  /** Lo que valdría por acción si el precio TERMINA en la meta (valor intrínseco). */
  valorEnMeta: number;
  /** Cuántas veces lo pagado (valorEnMeta ÷ ask). 0 si en la meta no vale nada. */
  multiplicador: number;
  /** Paga algo si el precio llega a la meta (el strike queda antes de la meta). */
  pagaEnMeta: boolean;
}

export interface OpcionesBaratos {
  spot: number;
  /** Meta del día (imán). Si es null o está pegada al precio, se miran los dos lados. */
  meta: number | null;
  saldo: number;
  /** Volumen de hoy mínimo para que se pueda vender de vuelta… */
  minVol?: number;
  /** …o contratos abiertos (antes de abrir, el volumen de hoy es 0). */
  minOi?: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * El mejor contrato que cabe, por lado. Prefiere los que PAGAN si el precio
 * llega a la meta y, entre ellos, el de más probabilidad (el más cercano al
 * dinero que todavía cabe). Exige que alguien lo compre de vuelta (bid > 0).
 */
export function elegirBaratos(ticker: string, rows: TicketChainRow[], o: OpcionesBaratos): Barato[] {
  const { spot, saldo } = o;
  const minVol = o.minVol ?? 50;
  const minOi = o.minOi ?? 200;
  if (!(spot > 0) || !(saldo > 0)) return [];

  // Dirección: hacia el imán. Si no hay imán o está pegado, se miran los dos lados.
  const metaUtil = o.meta != null && Math.abs(o.meta - spot) / spot >= 0.001 ? o.meta : null;
  const lados: ("call" | "put")[] = metaUtil == null ? ["call", "put"] : [metaUtil > spot ? "call" : "put"];

  const salida: Barato[] = [];
  for (const type of lados) {
    // Sin meta, se usa un movimiento de referencia del 1% hacia ese lado.
    const meta = metaUtil ?? (type === "call" ? spot * 1.01 : spot * 0.99);
    const candidatos: Barato[] = [];
    for (const r of rows) {
      if (r.type !== type) continue;
      const ask = r.ask, bid = r.bid;
      if (ask == null || bid == null || !(ask > 0) || !(bid >= 0.01)) continue;
      if (r.volume < minVol && r.oi < minOi) continue;
      const costo = ask * 100;
      if (costo > saldo) continue;
      // Solo fuera del dinero (o en él): los de adentro nunca son "baratos".
      if (type === "call" ? r.strike < spot : r.strike > spot) continue;

      const valorEnMeta = type === "call" ? Math.max(0, meta - r.strike) : Math.max(0, r.strike - meta);
      candidatos.push({
        ticker, type, strike: r.strike, expiration: r.expiration ?? null,
        bid, ask, costo: r2(costo), contratos: Math.floor(saldo / costo),
        probPct: r.delta != null ? Math.round(Math.abs(r.delta) * 1000) / 10 : null,
        spot, meta: r2(meta),
        distanciaPct: Math.round((Math.abs(r.strike - spot) / spot) * 1000) / 10,
        valorEnMeta: r2(valorEnMeta),
        multiplicador: Math.round((valorEnMeta / ask) * 10) / 10,
        pagaEnMeta: valorEnMeta > 0,
      });
    }
    candidatos.sort((a, b) =>
      Number(b.pagaEnMeta) - Number(a.pagaEnMeta)
      || (b.probPct ?? -1) - (a.probPct ?? -1)
      || a.distanciaPct - b.distanciaPct,
    );
    if (candidatos[0]) salida.push(candidatos[0]);
  }
  return salida;
}

/** Frase honesta para cada contrato, en palabras simples. */
export function fraseBarato(b: Barato): string {
  const dir = b.type === "call" ? "suba" : "baje";
  const prob = b.probPct != null ? `≈${Math.round(b.probPct)}% de probabilidad` : "probabilidad baja";
  const premio = b.pagaEnMeta
    ? `Si ${b.ticker} llega a ${b.meta} (el imán), valdría ~$${(b.valorEnMeta * 100).toFixed(0)} por contrato (${b.multiplicador}×).`
    : `Solo paga si ${b.ticker} pasa MÁS ALLÁ de ${b.strike} — más lejos que el imán.`;
  return `Necesita que ${b.ticker} ${dir} ${b.distanciaPct}% hasta ${b.strike}. ${prob}. ${premio} Lo normal es que termine en $0: pon solo lo que estás dispuesta a perder.`;
}
