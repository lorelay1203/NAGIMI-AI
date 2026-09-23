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

/** Cómo le fue a una lectura vieja contra lo que el precio hizo después. */
export interface ResultadoPunto {
  estado: "acerto" | "fallo" | "madurando" | "sinDatos";
  /** Etiqueta corta para la píldora. */
  txt: string;
  /** La frase completa, con el precio real. */
  detalle: string;
  cierreReal: number | null;
}

export interface PuntoTesis {
  fecha: string;              // YYYY-MM-DD
  direction: "up" | "down" | "flat";
  base: number;
  confidence: number;
  spot: number;
  /** null si no se le pasaron las evaluaciones. */
  resultado: ResultadoPunto | null;
}

export interface EvolucionTesis {
  puntos: PuntoTesis[];       // del más viejo al más nuevo (orden de lectura)
  /** Frase en llano comparando la primera lectura con la última. null si solo hay una. */
  narracion: string | null;
  /** "De las N lecturas que ya se pueden medir, acertó X." null si ninguna venció. */
  marcador: string | null;
}

/**
 * Lo mínimo que hace falta de cada evaluación. Es un subconjunto de
 * `PredictionEval` (predictionStore) para que esta lógica siga siendo pura y
 * se pueda probar sin disco ni red.
 */
export interface EvalPunto {
  date: string;
  matured: boolean;
  directionHit: boolean | null;
  baseTouched: boolean;
  actualClose: number | null;
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
export function buildEvolucion(
  snapshots: PredictionSnapshot[],
  max = 6,
  evals: EvalPunto[] = [],
): EvolucionTesis {
  if (!snapshots || snapshots.length === 0) return { puntos: [], narracion: null, marcador: null };

  // Ordena por fecha ascendente y deduplica por fecha (una foto por día — la
  // última guardada de ese día, que es la que POST ya deja).
  const porFecha = new Map<string, PredictionSnapshot>();
  for (const s of [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    porFecha.set(s.date, s);
  }
  const ordenadas = [...porFecha.values()].slice(-max);

  const porEval = new Map(evals.map((e) => [e.date, e]));

  const puntos: PuntoTesis[] = ordenadas.map((s) => ({
    fecha: s.date,
    direction: s.direction,
    base: s.base,
    confidence: s.confidence,
    spot: s.spot,
    resultado: evals.length > 0 ? resultadoDe(s, porEval.get(s.date)) : null,
  }));

  return { puntos, narracion: narrar(puntos), marcador: marcadorDe(puntos) };
}

/**
 * Qué pasó con una lectura vieja. Esto es lo que Aetheris NO hace: allá la
 * evolución de la tesis se cuenta sola, sin decir si acertó. Aquí cada punto
 * carga su resultado, aunque sea incómodo.
 */
function resultadoDe(s: PredictionSnapshot, e: EvalPunto | undefined): ResultadoPunto {
  const dirTxt = DIR_TXT[s.direction];

  if (!e || e.actualClose == null) {
    return {
      estado: "sinDatos", txt: "sin medir", cierreReal: null,
      detalle: "No se pudieron leer los precios posteriores, así que esta lectura no se puede puntuar (no cuenta como fallo).",
    };
  }
  if (!e.matured) {
    return {
      estado: "madurando", txt: "madurando", cierreReal: e.actualClose,
      detalle: `Todavía no cumple sus ${s.horizonDays} días. Va por ${money(e.actualClose)}${e.baseTouched ? " y ya tocó el objetivo" : ""}.`,
    };
  }
  const tocó = e.baseTouched ? "y llegó a tocar el objetivo" : "sin llegar al objetivo";
  if (e.directionHit === true) {
    return {
      estado: "acerto", txt: "acertó", cierreReal: e.actualClose,
      detalle: `Dijo ${dirTxt} desde ${money(s.spot)} y el precio acabó en ${money(e.actualClose)}, ${tocó}.`,
    };
  }
  return {
    estado: "fallo", txt: "falló", cierreReal: e.actualClose,
    detalle: `Dijo ${dirTxt} desde ${money(s.spot)} y el precio acabó en ${money(e.actualClose)}, ${tocó}.`,
  };
}

/** El marcador honesto de la ventana que se está mostrando. */
function marcadorDe(puntos: PuntoTesis[]): string | null {
  const medibles = puntos.filter((p) => p.resultado?.estado === "acerto" || p.resultado?.estado === "fallo");
  if (medibles.length === 0) return null;
  const acertadas = medibles.filter((p) => p.resultado?.estado === "acerto").length;
  // Concordancia: "1 lectura que ya se PUEDE medir" vs "3 lecturas que ya se PUEDEN medir".
  const frase = medibles.length === 1
    ? "De 1 lectura que ya se puede medir aquí"
    : `De ${medibles.length} lecturas que ya se pueden medir aquí`;
  return `${frase}, acertó la dirección en ${acertadas}.`;
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
