// ============================================================================
// La barra de rango de "Tu investigación".
//
// FinAnalista pinta bajista → base → alcista con un punto en el precio. Nagimi
// no tiene esos escenarios para cada ticker de la tabla, pero sí algo más útil
// para opciones: el CANAL DE GAMMA de hoy — del suelo (muro de puts) al techo
// (muro de calls), con el imán marcado. Mismo dibujo, dato real.
//
// Puro: recibe números, devuelve posiciones en % para dibujar.
// ============================================================================

export interface RangoCanal {
  /** El nivel más bajo del canal (normalmente el muro de puts). */
  suelo: number;
  /** El más alto (normalmente el muro de calls). */
  techo: number;
  iman: number | null;
  /** Posición del imán en la barra (0-100), o null si cae fuera del canal. */
  imanPct: number | null;
  /** Posición del precio en la barra, recortada a 0-100 para dibujar. */
  precioPct: number;
  /** El precio ya rompió el canal: se dibuja en el borde y se dice. */
  fuera: "arriba" | "abajo" | null;
}

/**
 * Calcula la barra. Devuelve null si falta un muro o los dos son el mismo
 * número (no hay canal que dibujar). Si los muros vienen al revés (el de puts
 * más alto que el de calls), se ordenan: la barra siempre va de menor a mayor.
 */
export function rangoCanal(
  precio: number,
  muroPuts: number | null,
  muroCalls: number | null,
  iman: number | null,
): RangoCanal | null {
  if (muroPuts == null || muroCalls == null || !(precio > 0)) return null;
  const suelo = Math.min(muroPuts, muroCalls);
  const techo = Math.max(muroPuts, muroCalls);
  if (techo - suelo <= 0) return null;

  const pct = (x: number) => ((x - suelo) / (techo - suelo)) * 100;
  const crudo = pct(precio);
  const fuera = crudo > 100 ? "arriba" : crudo < 0 ? "abajo" : null;
  const imanDentro = iman != null && iman >= suelo && iman <= techo;

  return {
    suelo,
    techo,
    iman,
    imanPct: imanDentro ? pct(iman) : null,
    precioPct: Math.min(100, Math.max(0, crudo)),
    fuera,
  };
}
