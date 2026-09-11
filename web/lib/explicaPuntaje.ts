// ============================================================================
// "Por qué este puntaje" — traduce el desglose de sub-agentes a una frase en
// llano: qué empuja el puntaje hacia arriba y qué lo frena. Es la sección
// "La Puntuación" de Aetheris, pero explicada en una línea a nivel boricua.
//
// Nagimi YA muestra las barras por señal; esto le pone el "por qué" en palabras,
// que es lo que Lorelay quiere. Puro y testable.
// ============================================================================

export interface ParteScore {
  /** Nombre del sub-agente, ej. "Agresividad". */
  name: string;
  /** Puntaje 0-10, o null si ese sub-agente no tiene dato todavía. */
  score: number | null;
  /** Peso en el scorecard (0-100). */
  weight: number;
}

/** Un sub-agente empuja arriba si va por encima de 6, frena si va por debajo de 4.5. */
const UMBRAL_ARRIBA = 6;
const UMBRAL_ABAJO = 4.5;

/**
 * Explica el puntaje compuesto (0-100) en llano. Nombra el sub-agente que más
 * lo sube y el que más lo baja, ponderando por peso × distancia del centro
 * (así "manda" el que de verdad mueve la aguja, no cualquiera).
 * Devuelve null si no hay señales con dato.
 */
export function explicaPuntaje(score: number, partes: ParteScore[]): string | null {
  const conDato = partes.filter((p) => p.score != null);
  if (conDato.length === 0) return null;

  const etiqueta = score >= 60 ? "alcista" : score >= 45 ? "neutral" : "bajista";

  // Fuerza con signo: (score − 5) × peso. Positiva empuja arriba, negativa frena.
  const conFuerza = conDato.map((p) => ({ name: p.name, fuerza: ((p.score as number) - 5) * p.weight, score: p.score as number }));
  const suben = conFuerza.filter((p) => p.score >= UMBRAL_ARRIBA).sort((a, b) => b.fuerza - a.fuerza);
  const bajan = conFuerza.filter((p) => p.score <= UMBRAL_ABAJO).sort((a, b) => a.fuerza - b.fuerza);

  const arriba = suben[0];
  const abajo = bajan[0];

  const base = `El puntaje es ${score} (${etiqueta}).`;

  if (arriba && abajo) {
    return `${base} Lo empuja arriba ${arriba.name.toLowerCase()}; lo frena ${abajo.name.toLowerCase()}.`;
  }
  if (arriba) {
    return `${base} Lo que más ayuda es ${arriba.name.toLowerCase()}, y ninguna señal lo está frenando con fuerza.`;
  }
  if (abajo) {
    return `${base} Lo que más lo frena es ${abajo.name.toLowerCase()}, y ninguna señal lo empuja con fuerza.`;
  }
  return `${base} Ninguna señal destaca — todas están en terreno medio, por eso queda parejo.`;
}
