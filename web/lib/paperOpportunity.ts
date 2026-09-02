// ============================================================================
// Convierte un trade del diario en papel en una OPORTUNIDAD DE HOY.
//
// El P/L que muestra el diario es lo que habría pasado desde que el motor
// encontró la idea. Eso no sirve para decidir: lo que importa es qué pasa si
// entras AHORA, al precio de ahora.
//
// Además clasifica el trade por tiempo (vencido / vence hoy / quedan días) y
// detecta si "ya corrió" — si el movimiento que se buscaba ya ocurrió, la
// oportunidad se fue y hay que sacarla de la lista para no confundirla con una
// entrada válida.
// ============================================================================

import { analyzeStrategy, type PayoffLeg } from "./payoff";
import type { PaperTrade } from "./paper";

export type EstadoTiempo = "vencido" | "vence_hoy" | "vigente";
export type EstadoOportunidad = "entrable" | "ya_corrio" | "vencido" | "sin_precio";

/** Fecha de hoy en horario del este (el día de mercado). */
export function etToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** Vencimiento más cercano entre las patas. */
export function vencimientoDe(t: PaperTrade): string | null {
  const fechas = t.legs.map((l) => l.expiration).filter((e): e is string => !!e).sort();
  return fechas[0] ?? null;
}

/** Días de mercado restantes (aproximado: días naturales). */
export function diasRestantes(expiration: string, hoy = etToday()): number {
  const a = Date.parse(`${expiration}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

export function estadoTiempo(t: PaperTrade, hoy = etToday()): { estado: EstadoTiempo; dias: number; expiration: string | null } {
  const expiration = vencimientoDe(t);
  if (!expiration) return { estado: "vigente", dias: 99, expiration: null };
  const dias = diasRestantes(expiration, hoy);
  if (dias < 0) return { estado: "vencido", dias, expiration };
  if (dias === 0) return { estado: "vence_hoy", dias, expiration };
  return { estado: "vigente", dias, expiration };
}

export interface Oportunidad {
  id: string;
  ticker: string;
  label: string;
  expiration: string | null;
  dias: number;
  estado: EstadoOportunidad;
  /** Por qué está en ese estado, en simple. */
  motivo: string;
  /** Lo que costaría/cobrarías por contrato AHORA (>0 pagas, <0 cobras). */
  netoAhora: number | null;
  /** Neto de cuando el motor la encontró, para comparar. */
  netoOriginal: number;
  /** Dinero que hay que poner por contrato (débito = coste; crédito = riesgo). */
  desembolso: number | null;
  maxGanancia: number | null;
  maxPerdida: number | null;
  /** Probabilidad de ganar, 0-100. */
  pop: number | null;
  breakevens: number[];
  /** Merece avisar: aún hay tiempo y sigue entrable. */
  alertar: boolean;
}

/** El precio de cada pata AHORA, para valorar la entrada de hoy. */
export interface PrecioPata { strike: number; type: "call" | "put"; mid: number }

/** Un paso del razonamiento, para poder mostrarlo como lista. */
export interface PasoPorQue { titulo: string; detalle: string; señal: "ok" | "aviso" | "no" | "info" }

/**
 * ¿Entrar hoy es mejor que cuando el motor la encontró?
 * En un crédito, cobrar más es mejor; en un débito, pagar menos.
 */
export function mejorQueAntes(netoOriginal: number, netoAhora: number): boolean {
  if (netoOriginal < 0) return Math.abs(netoAhora) > Math.abs(netoOriginal); // crédito: cobras más
  return netoAhora < netoOriginal;                                           // débito: pagas menos
}

/**
 * Reconstruye CÓMO se llegó a la conclusión de hoy, paso a paso. Es lo que la
 * pantalla muestra al desplegar «¿Por qué?»: no basta con decir "entrable", hay
 * que poder ver qué se comprobó y con qué números.
 */
export function porQueDeLaOportunidad(o: Oportunidad, hoy = etToday()): PasoPorQue[] {
  const pasos: PasoPorQue[] = [];
  const $ = (n: number) => `$${Math.abs(n).toFixed(0)}`;

  // 1) El calendario manda: si venció, no hay nada más que mirar.
  if (o.expiration) {
    pasos.push(
      o.estado === "vencido"
        ? { titulo: "¿Sigue viva?", señal: "no",
            detalle: `No. Venció el ${o.expiration} y hoy es ${hoy}, así que ya no se puede entrar.` }
        : { titulo: "¿Sigue viva?", señal: o.dias <= 1 ? "aviso" : "ok",
            detalle: o.dias === 0
              ? `Sí, pero vence HOY (${o.expiration}): se resuelve en horas.`
              : `Sí. Vence el ${o.expiration}, quedan ${o.dias} día${o.dias === 1 ? "" : "s"}.` },
    );
  }
  if (o.estado === "vencido") return pasos;

  // 2) ¿El precio de entrada sigue siendo parecido al que vio el motor?
  if (o.netoAhora != null) {
    const antes = o.netoOriginal * 100, ahora = o.netoAhora * 100;
    const esCredito = o.netoOriginal < 0;
    const cambio = Math.abs(antes) > 0 ? ((Math.abs(ahora) - Math.abs(antes)) / Math.abs(antes)) * 100 : 0;
    pasos.push(
      o.estado === "ya_corrio"
        ? { titulo: "¿Se movió ya el precio?", señal: "no",
            detalle: esCredito
              ? `Sí, y en tu contra: la prima pasó de ${$(antes)} a ${$(ahora)} (${cambio.toFixed(0)}%). Ya no queda casi nada que cobrar.`
              : `Sí: entrar costaba ${$(antes)} y ahora cuesta ${$(ahora)} (${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%). El movimiento que buscabas ya pasó.` }
        : { titulo: "¿Se movió ya el precio?", señal: "ok",
            // Ojo con el sentido: en un crédito, cobrar MÁS es mejor; en un
            // débito, pagar MENOS es mejor. Decir "no se movió lo suficiente"
            // cuando la entrada mejoró sería engañoso.
            detalle: mejorQueAntes(o.netoOriginal, o.netoAhora!)
              ? `Sí, y a tu favor: ${esCredito ? "ahora cobras" : "ahora cuesta"} ${$(ahora)} en vez de ${$(antes)} `
                + `(${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%). Entras en mejores condiciones que cuando se detectó.`
              : `No lo suficiente. ${esCredito ? "La prima" : "El coste"} pasó de ${$(antes)} a ${$(ahora)} `
                + `(${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%), así que la idea sigue en pie.` },
    );
  } else {
    pasos.push({ titulo: "¿Se movió ya el precio?", señal: "info",
      detalle: "No se pudo saber: falta el precio en vivo de alguna pata." });
  }
  if (o.estado === "ya_corrio" || o.estado === "sin_precio") return pasos;

  // 3) Los números de entrar hoy.
  if (o.desembolso != null) {
    pasos.push({ titulo: "Si entras ahora", señal: "info",
      detalle: `Pones ${$(o.desembolso)}. Como mucho ganas ${$(o.maxGanancia ?? 0)} y como mucho pierdes `
        + `${$(o.maxPerdida ?? 0)}${o.pop != null ? `, con ${o.pop.toFixed(0)}% de probabilidad de acabar ganando` : ""}.`
        + (o.breakevens.length ? ` Empiezas a ganar a partir de ${o.breakevens.map((b) => b.toFixed(2)).join(" y ")}.` : "") });
  }

  return pasos;
}

function legsAPayoff(t: PaperTrade, precios: PrecioPata[]): PayoffLeg[] | null {
  const out: PayoffLeg[] = [];
  for (const l of t.legs) {
    if (l.type === "stock" || l.strike == null) continue;
    const p = precios.find((x) => x.strike === l.strike && x.type === l.type);
    if (!p || !(p.mid > 0)) return null; // sin precio no se inventa nada
    out.push({ side: l.side, optionType: l.type, strike: l.strike, quantity: l.qty, limitPrice: p.mid });
  }
  return out.length ? out : null;
}

/** Neto por contrato: lo que pagas (positivo) o cobras (negativo). */
export function netoDe(legs: PayoffLeg[]): number {
  return legs.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * l.limitPrice * l.quantity, 0);
}

/**
 * ¿"Ya corrió"? Si entrar hoy es claramente peor que cuando el motor la vio, el
 * movimiento ya pasó y la ventaja se fue.
 *   · Débito (pagas): se encareció mucho → ya subió lo que se esperaba.
 *   · Crédito (cobras): ahora pagan mucho menos → la prima ya se consumió.
 */
export function yaCorrio(netoOriginal: number, netoAhora: number, umbral = 0.35): boolean {
  const o = Math.abs(netoOriginal), n = Math.abs(netoAhora);
  if (!(o > 0)) return false;
  if (netoOriginal > 0) return netoAhora > o * (1 + umbral);  // débito más caro
  return n < o * (1 - umbral);                                 // crédito más flaco
}

/**
 * Evalúa un trade en papel como oportunidad de hoy.
 * `precios` son los mid de cada pata ahora; si faltan, se dice y no se inventa.
 */
export function evaluarOportunidad(
  t: PaperTrade,
  precios: PrecioPata[],
  spot: number,
  iv: number,
  hoy = etToday(),
): Oportunidad {
  const { estado: tiempo, dias, expiration } = estadoTiempo(t, hoy);
  const base = {
    id: t.id, ticker: t.ticker, label: t.label, expiration, dias,
    netoOriginal: t.entryNet, netoAhora: null as number | null,
    desembolso: null as number | null, maxGanancia: null as number | null,
    maxPerdida: null as number | null, pop: null as number | null,
    breakevens: [] as number[], alertar: false,
  };

  if (tiempo === "vencido") {
    return { ...base, estado: "vencido", motivo: `Venció el ${expiration}. Ya no se puede entrar.` };
  }

  const legs = legsAPayoff(t, precios);
  if (!legs) {
    return { ...base, estado: "sin_precio", motivo: "No hay precios en vivo de todas las patas ahora mismo." };
  }

  const netoAhora = netoDe(legs);
  const r = analyzeStrategy(legs, spot, iv, Math.max(dias, 1));
  const desembolso = netoAhora > 0 ? netoAhora * 100 : Math.abs(r.maxLoss);

  if (yaCorrio(t.entryNet, netoAhora)) {
    return {
      ...base, estado: "ya_corrio", netoAhora, desembolso,
      maxGanancia: r.maxGain, maxPerdida: r.maxLoss, pop: r.pop * 100, breakevens: r.breakevens,
      motivo: t.entryNet > 0
        ? `El movimiento ya pasó: entrar ahora cuesta $${(netoAhora * 100).toFixed(0)} contra los $${(t.entryNet * 100).toFixed(0)} de cuando se detectó.`
        : `La prima ya se consumió: ahora te pagarían $${Math.abs(netoAhora * 100).toFixed(0)} en vez de $${Math.abs(t.entryNet * 100).toFixed(0)}.`,
    };
  }

  const motivo = tiempo === "vence_hoy"
    ? "Vence HOY: si entras, se resuelve en horas."
    : `Quedan ${dias} día${dias === 1 ? "" : "s"} hasta el vencimiento.`;

  return {
    ...base, estado: "entrable", netoAhora, desembolso,
    maxGanancia: r.maxGain, maxPerdida: r.maxLoss, pop: r.pop * 100, breakevens: r.breakevens,
    motivo,
    // Avisar solo si aún hay margen para actuar y la idea sigue en pie.
    alertar: dias >= 0 && r.maxGain > 0,
  };
}
