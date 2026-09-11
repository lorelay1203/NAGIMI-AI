// ============================================================================
// "En términos simples: esto es como…" — la analogía del veredicto.
//
// Aetheris abre con una analogía ("NVIDIA es como el que vende palas en la
// fiebre del oro"). En opciones la analogía más ÚTIL no es sobre la empresa
// (Nagimi no hace fundamentales) sino sobre el RÉGIMEN de gamma — el concepto
// más difícil de entender y el que más cambia cómo se mueve el precio hoy.
//
// Puro y testable. A nivel boricua, sin jerga.
// ============================================================================

export type Regimen = "positive" | "negative" | undefined;
export type Direccion = "up" | "down" | "flat";

/**
 * Elige la analogía según cómo se mueve el mercado hoy. El régimen manda
 * (es lo que decide si el precio "vuelve al centro" o "se dispara"); si no
 * hay régimen, cae a una analogía por dirección.
 */
export function analogia(direction: Direccion, regimen: Regimen, confidence: number): string {
  if (regimen === "positive") {
    return "Piénsalo como una canica dentro de un tazón: la muevas para donde la muevas, "
      + "tiende a rodar de vuelta al centro. Hoy el precio se resiste a irse lejos.";
  }
  if (regimen === "negative") {
    return "Piénsalo como una canica en la punta de una loma: un empujoncito la manda lejos "
      + "y rápido. Hoy los movimientos se aceleran en vez de frenarse — cuidado.";
  }

  // Sin régimen (no llegó el GEX): analogía por dirección/confianza.
  if (confidence < 33 || direction === "flat") {
    return "Las señales están cruzadas, como un semáforo en amarillo: mejor esperar a que "
      + "se ponga verde o rojo claro antes de cruzar.";
  }
  if (direction === "up") {
    return "El dinero grande está remando todo para el mismo lado, hacia arriba — y cuando "
      + "todos reman igual, el bote se mueve para allá.";
  }
  return "El dinero grande está remando todo para el mismo lado, hacia abajo — y cuando "
    + "todos reman igual, el bote se mueve para allá.";
}
