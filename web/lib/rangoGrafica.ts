// ============================================================================
// El selector de rango de la gráfica: 1M · 3M · 6M · 1A.
//
// El reporte de Aetheris deja escoger cuánto histórico se ve. Nagimi ya recibe
// hasta un año de velas diarias del servidor, así que cambiar de rango NO es
// pedir datos otra vez: es enseñar solo el pedazo final de lo que ya está en
// memoria. Por eso esto es una función pura y no una llamada al API.
//
// Se corta contando SESIONES y no fechas del calendario: las velas diarias ya
// son sesiones de bolsa, y contarlas evita tener que saberse los feriados ni
// tropezar con los huecos que a veces deja el proveedor.
// ============================================================================

export type RangoId = "1M" | "3M" | "6M" | "1A";

export interface RangoOpcion {
  id: RangoId;
  /** Lo que se lee en el botón. Corto, igual que en el reporte de Aetheris. */
  label: string;
  /** Lo que aparece al pasar el cursor, en llano. */
  ayuda: string;
  /** Cuántas sesiones de bolsa entran en ese rango (≈21 por mes). */
  sesiones: number;
}

export const RANGOS: readonly RangoOpcion[] = [
  { id: "1M", label: "1M", ayuda: "El último mes", sesiones: 21 },
  { id: "3M", label: "3M", ayuda: "Los últimos tres meses", sesiones: 63 },
  { id: "6M", label: "6M", ayuda: "Los últimos seis meses", sesiones: 126 },
  { id: "1A", label: "1A", ayuda: "El último año", sesiones: 252 },
] as const;

/**
 * Por defecto 6 meses.
 *
 * Lorelay opera swing (días o semanas). Un mes se queda corto para ver dónde
 * están de verdad el techo y el piso, y un año aplasta las velas recientes —
 * que son las que importan para entrar. Seis meses enseña la estructura sin
 * esconder lo que pasó esta semana.
 */
export const RANGO_POR_DEFECTO: RangoId = "6M";

/** Para no confiarse de lo que haya quedado guardado en el navegador. */
export function esRangoId(v: unknown): v is RangoId {
  return typeof v === "string" && RANGOS.some((r) => r.id === v);
}

export function opcionRango(id: RangoId): RangoOpcion {
  return RANGOS.find((r) => r.id === id) ?? RANGOS.find((r) => r.id === RANGO_POR_DEFECTO)!;
}

/**
 * Cuánto del rango hay que tener para darlo por completo (90%).
 *
 * Un año son "unas" 252 sesiones, no exactamente 252: los feriados cambian de
 * año en año y el proveedor a veces se come un par de días. Sin esta holgura,
 * un ticker normalísimo con 248 velas saldría avisando que le faltan datos en
 * cada carga, y el aviso dejaría de significar algo. Con ella solo salta
 * cuando de verdad falta un pedazo grande (un ticker que salió a bolsa hace
 * poco, por ejemplo).
 */
const COMPLETO_SUFICIENTE = 0.9;

export interface Recorte<T> {
  /** Las velas que se le pasan al gráfico. */
  barras: T[];
  /** Cuántas sesiones pedía el rango escogido. */
  pedidas: number;
  /** Cuántas sesiones tiene el ticker en total. */
  disponibles: number;
  /** El ticker tiene menos velas que el rango: hay que decirlo, no disimularlo. */
  incompleto: boolean;
}

/**
 * Se queda con las últimas N sesiones. Genérico a propósito: solo corta el
 * arreglo, no le importa qué trae cada vela.
 *
 * Si le entra un rango que no existe (por ejemplo, basura vieja guardada en el
 * navegador), cae en el rango por defecto en vez de devolver la serie vacía.
 */
export function recortarRango<T>(barras: readonly T[], rango: RangoId): Recorte<T> {
  const pedidas = opcionRango(esRangoId(rango) ? rango : RANGO_POR_DEFECTO).sesiones;
  const disponibles = barras.length;
  // slice desde el final: si hay menos velas que las pedidas, se llevan todas.
  const cortadas = disponibles > pedidas ? barras.slice(disponibles - pedidas) : barras.slice();

  return {
    barras: cortadas,
    pedidas,
    disponibles,
    incompleto: disponibles > 0 && disponibles < pedidas * COMPLETO_SUFICIENTE,
  };
}

/**
 * La línea chiquita de aviso debajo del gráfico.
 *
 * Regla de la casa: nunca fingir. Si el ticker no llega al rango pedido, se
 * enseña lo que hay y se dice cuánto es, en vez de dejar creer que eso son
 * seis meses completos. Devuelve null cuando no hay nada que aclarar.
 */
export function avisoRecorte<T>(r: Recorte<T>): string | null {
  if (!r.incompleto) return null;
  return r.disponibles === 1
    ? "Solo hay 1 sesión de este ticker: es la única que se puede enseñar."
    : `Solo hay ${r.disponibles} sesiones de este ticker: se enseñan todas.`;
}
