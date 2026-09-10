// ============================================================================
// "Cómo ha cambiado la lectura" — la evolución de la tesis de Nagimi sobre un
// ticker, a partir de las fotos que ya guarda en data/predictions/.
//
// Es la respuesta a la "EVOLUCIÓN DE LA TESIS" de Aetheris (Neutral $231 →
// $230 → $229 → $218), pero con una diferencia: además de los puntos, dice
// en llano si Nagimi se puso más optimista, más cauteloso, o cambió de bando.
// Puro y testable: no toca red ni disco.
// ============================================================================

import type { PredictionSnapshot } from "./predictionStore";

export interface PuntoTesis {
  fecha: string;              // YYYY-MM-DD
  direction: "up" | "down" | "flat";
  base: number;
  confidence: number;
  spot: number;
}

export interface EvolucionTesis {
  puntos: PuntoTesis[];       // del más viejo al más nuevo (orden de lectura)
  /** Frase en llano comparando la primera lectura con la última. null si solo hay una. */
  narracion: string | null;
}

const DIR_TXT: Record<PuntoTesis["direction"], string> = {
  up: "alcista", down: "bajista", flat: "neutral",
};

/** Rango de "optimismo": bajista(0) < neutral(1) < alcista(2). Para comparar. */
const nivel = (d: PuntoTesis["direction"]): number => (d === "down" ? 0 : d === "flat" ? 1 : 2);

/** Días de calendario entre dos fechas YYYY-MM-DD (>= 0). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;

/**
 * Arma la evolución a partir de las fotos guardadas (en cualquier orden).
 * Se queda con las últimas `max` por fecha, de la más vieja a la más nueva.
 */
export function buildEvolucion(snapshots: PredictionSnapshot[], max = 6): EvolucionTesis {
  if (!snapshots || snapshots.length === 0) return { puntos: [], narracion: null };

  // Ordena por fecha ascendente y deduplica por fecha (una foto por día — la
  // última guardada de ese día, que es la que POST ya deja).
  const porFecha = new Map<string, PredictionSnapshot>();
  for (const s of [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    porFecha.set(s.date, s);
  }
  const ordenadas = [...porFecha.values()].slice(-max);

  const puntos: PuntoTesis[] = ordenadas.map((s) => ({
    fecha: s.date,
    direction: s.direction,
    base: s.base,
    confidence: s.confidence,
    spot: s.spot,
  }));

  return { puntos, narracion: narrar(puntos) };
}

/** La frase en llano: compara la primera lectura de la ventana con la última. */
function narrar(puntos: PuntoTesis[]): string | null {
  if (puntos.length < 2) return null;
  const viejo = puntos[0];
  const nuevo = puntos[puntos.length - 1];
  const dias = diasEntre(viejo.fecha, nuevo.fecha);
  const haceTxt = dias === 0 ? "hoy mismo" : dias === 1 ? "ayer" : `hace ${dias} días`;

  const dNivel = nivel(nuevo.direction) - nivel(viejo.direction);
  const dConf = nuevo.confidence - viejo.confidence;

  let cambio: string;
  if (dNivel > 0) cambio = "se puso más optimista";
  else if (dNivel < 0) cambio = "se puso más cauteloso";
  else if (Math.abs(dConf) >= 10) cambio = dConf > 0 ? "mantiene la dirección, pero con más confianza" : "mantiene la dirección, pero con menos confianza";
  else cambio = "mantiene prácticamente la misma lectura";

  return `${haceTxt} Nagimi la veía ${DIR_TXT[viejo.direction]} apuntando a ${money(viejo.base)}; `
    + `hoy la ve ${DIR_TXT[nuevo.direction]} a ${money(nuevo.base)} — ${cambio}.`;
}
