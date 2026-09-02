// ============================================================================
// Estrategias de COMPRA de prima (débito) para el motor automático.
//
// Van aparte de la venta de prima porque los filtros no sirven igual:
//   · Un call comprado tiene POP bajo por naturaleza (~30-45%). Exigirle 60%
//     como a un credit spread lo descartaría siempre, y no por ser mal trade.
//   · Su ganancia no tiene techo, así que el "premio ÷ riesgo" se dispara y no
//     sirve para ordenar. Aquí se ordena por cuánto se necesita que se mueva el
//     precio para empatar: cuanto menos, mejor.
//   · Lo que se arriesga es exactamente lo que se paga, así que el filtro de
//     cuenta chica es simple y directo: ¿cabe el coste?
// ============================================================================

import { analyzeStrategy, type PayoffLeg } from "./payoff";
import type { StratKind } from "./strategyGuide";

const MULT = 100; // un contrato = 100 acciones

/** Precio medio por strike, ya separado por tipo. */
export interface CadenaMids {
  call: Map<number, number>;
  put: Map<number, number>;
  strikes: number[];
}

export interface DebitCandidato {
  kind: StratKind;
  legs: PayoffLeg[];
  /** Lo que pagas por 1 contrato, en dólares. */
  costo: number;
  maxGanancia: number | null; // null = sin techo
  maxPerdida: number;
  pop: number;
  breakevens: number[];
  /** Cuánto tiene que moverse el precio (%) para empezar a ganar. */
  movimientoNecesarioPct: number;
  strikesLabel: string;
}

export function strikeMasCercano(strikes: number[], objetivo: number): number {
  return strikes.reduce((best, s) => (Math.abs(s - objetivo) < Math.abs(best - objetivo) ? s : best), strikes[0]);
}

function pata(side: "buy" | "sell", optionType: "call" | "put", strike: number, price: number): PayoffLeg {
  return { side, optionType, strike, quantity: 1, limitPrice: price };
}

/** Cuánto debe moverse el precio, en %, hasta el punto de equilibrio más cercano. */
function movimientoNecesario(breakevens: number[], spot: number): number {
  if (!breakevens.length || !(spot > 0)) return Infinity;
  const cercano = breakevens.reduce((b, x) => (Math.abs(x - spot) < Math.abs(b - spot) ? x : b), breakevens[0]);
  return (Math.abs(cercano - spot) / spot) * 100;
}

/**
 * Arma todas las estrategias de compra que quepan en el presupuesto.
 *
 * `maxCosto` es lo máximo a pagar por contrato (el riesgo real de un débito).
 * Devuelve las candidatas ordenadas: primero la que necesita menos movimiento.
 */
export function construirDebitos(opts: {
  spot: number;
  iv: number;
  dte: number;
  cadena: CadenaMids;
  maxCosto: number;
  permitidas: StratKind[];
  /** Ancho del spread en pasos de strike (1 = el strike de al lado). */
  pasosSpread?: number;
}): DebitCandidato[] {
  const { spot, iv, dte, cadena, maxCosto, permitidas, pasosSpread = 2 } = opts;
  const { call, put, strikes } = cadena;
  if (!(spot > 0) || strikes.length < 3 || !(iv > 0)) return [];

  const permite = new Set(permitidas);
  const paso = pasoMediano(strikes);
  const atm = strikeMasCercano(strikes, spot);
  const out: DebitCandidato[] = [];

  const precio = (t: "call" | "put", k: number): number | null => {
    const m = (t === "call" ? call : put).get(k);
    return m != null && m > 0 ? m : null;
  };

  const registrar = (kind: StratKind, legs: PayoffLeg[], strikesLabel: string) => {
    const costo = legs.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * l.limitPrice * l.quantity, 0) * MULT;
    if (!(costo > 0) || costo > maxCosto) return;   // solo débitos que quepan
    const a = analyzeStrategy(legs, spot, iv, Math.max(dte, 1));
    const mov = movimientoNecesario(a.breakevens, spot);
    if (!Number.isFinite(mov)) return;
    out.push({
      kind, legs, costo,
      maxGanancia: a.unbounded ? null : a.maxGain,
      // Comprar tiene la pérdida acotada a lo pagado; se usa el coste real.
      maxPerdida: costo,
      pop: a.pop, breakevens: a.breakevens,
      movimientoNecesarioPct: mov, strikesLabel,
    });
  };

  // ── Singles: una sola pata, lo más simple ──
  if (permite.has("long_call")) {
    // Se prueba el del dinero y un par por encima: los de arriba son más baratos.
    for (const k of [atm, strikeMasCercano(strikes, spot + paso), strikeMasCercano(strikes, spot + 2 * paso)]) {
      const p = precio("call", k);
      if (p != null) registrar("long_call", [pata("buy", "call", k, p)], `${k}c`);
    }
  }
  if (permite.has("long_put")) {
    for (const k of [atm, strikeMasCercano(strikes, spot - paso), strikeMasCercano(strikes, spot - 2 * paso)]) {
      const p = precio("put", k);
      if (p != null) registrar("long_put", [pata("buy", "put", k, p)], `${k}p`);
    }
  }

  // ── Spreads de débito: la versión barata del single, con techo ──
  if (permite.has("call_debit")) {
    const largo = atm;
    const corto = strikeMasCercano(strikes, atm + pasosSpread * paso);
    const pl = precio("call", largo), pc = precio("call", corto);
    if (pl != null && pc != null && corto > largo) {
      registrar("call_debit", [pata("buy", "call", largo, pl), pata("sell", "call", corto, pc)], `${largo}/${corto}c`);
    }
  }
  if (permite.has("put_debit")) {
    const largo = atm;
    const corto = strikeMasCercano(strikes, atm - pasosSpread * paso);
    const pl = precio("put", largo), pc = precio("put", corto);
    if (pl != null && pc != null && corto < largo) {
      registrar("put_debit", [pata("buy", "put", largo, pl), pata("sell", "put", corto, pc)], `${corto}/${largo}p`);
    }
  }

  // ── Straddle: call + put del MISMO strike ──
  if (permite.has("straddle")) {
    const pc = precio("call", atm), pp = precio("put", atm);
    if (pc != null && pp != null) {
      registrar("straddle", [pata("buy", "call", atm, pc), pata("buy", "put", atm, pp)], `${atm}c + ${atm}p`);
    }
  }

  // ── Strangle: call arriba + put abajo, más barato que el straddle ──
  if (permite.has("strangle")) {
    for (const pasos of [1, 2, 3]) {
      const kc = strikeMasCercano(strikes, spot + pasos * paso);
      const kp = strikeMasCercano(strikes, spot - pasos * paso);
      const pc = precio("call", kc), pp = precio("put", kp);
      if (pc != null && pp != null && kc > kp) {
        registrar("strangle", [pata("buy", "call", kc, pc), pata("buy", "put", kp, pp)], `${kc}c + ${kp}p`);
      }
    }
  }

  // Se queda la mejor de cada tipo: la que menos movimiento necesita.
  const mejorPorTipo = new Map<StratKind, DebitCandidato>();
  for (const c of out) {
    const cur = mejorPorTipo.get(c.kind);
    if (!cur || c.movimientoNecesarioPct < cur.movimientoNecesarioPct) mejorPorTipo.set(c.kind, c);
  }
  return [...mejorPorTipo.values()].sort((a, b) => a.movimientoNecesarioPct - b.movimientoNecesarioPct);
}

/** Separación típica entre strikes de la cadena. */
export function pasoMediano(strikes: number[]): number {
  if (strikes.length < 2) return 1;
  const difs = [];
  for (let i = 1; i < strikes.length; i++) {
    const d = strikes[i] - strikes[i - 1];
    if (d > 0) difs.push(d);
  }
  if (!difs.length) return 1;
  difs.sort((a, b) => a - b);
  return difs[Math.floor(difs.length / 2)];
}
