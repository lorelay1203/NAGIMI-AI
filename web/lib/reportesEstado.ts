// ============================================================================
// El ESTADO de cada reporte de la bitácora, y los filtros de la página.
//
// FinAnalista tiene una columna "Estado" y filtros arriba de la tabla. Aquí el
// estado no es "borrador/publicado" como allá: es lo único que importa de una
// predicción vieja — si acertó, si falló, o si todavía no se puede medir.
//
// Puro y testable: recibe la fila, devuelve etiqueta y color.
// ============================================================================

export type EstadoClave = "acertando" | "medias" | "fallando" | "madurando" | "sinDatos";

export interface Estado {
  clave: EstadoClave;
  /** Etiqueta corta para la columna. */
  txt: string;
  /** Clase de color de la píldora (misma que usa la tabla del panel). */
  cls: "up" | "down" | "mid" | "flat";
  /** Por qué está en ese estado, para el tooltip. */
  porQue: string;
}

export interface FilaMedible {
  aciertoDireccion: number | null;
  vencidas: number;
  sinDatos: boolean;
}

/** Desde qué acierto se considera que va bien / que va mal. */
export const BIEN = 60;
export const MAL = 40;

/** "1 predicción" / "12 predicciones" — el plural bien dicho. */
const preds = (n: number) => `${n} ${n === 1 ? "predicción" : "predicciones"}`;

export function estadoDe(f: FilaMedible): Estado {
  // Ojo al orden: "no se pudo medir" NO es lo mismo que "falló". Si no se
  // pudieron bajar los precios, la predicción no entra en ningún porcentaje.
  if (f.sinDatos) {
    return { clave: "sinDatos", txt: "sin medir", cls: "flat",
      porQue: "No se pudieron bajar los precios de ese ticker, así que sus predicciones no se pueden puntuar." };
  }
  if (f.vencidas === 0 || f.aciertoDireccion == null) {
    return { clave: "madurando", txt: "madurando", cls: "flat",
      porQue: "Ninguna predicción ha cumplido su plazo todavía. Hay que esperar a que pase el horizonte." };
  }
  if (f.aciertoDireccion >= BIEN) {
    return { clave: "acertando", txt: "acertando", cls: "up",
      porQue: `Acertó la dirección el ${f.aciertoDireccion.toFixed(0)}% de ${preds(f.vencidas)} ya vencidas.` };
  }
  if (f.aciertoDireccion >= MAL) {
    return { clave: "medias", txt: "a medias", cls: "mid",
      porQue: `Acertó el ${f.aciertoDireccion.toFixed(0)}% de ${preds(f.vencidas)}: casi lo mismo que tirar una moneda.` };
  }
  return { clave: "fallando", txt: "fallando", cls: "down",
    porQue: `Solo acertó el ${f.aciertoDireccion.toFixed(0)}% de ${preds(f.vencidas)} vencidas.` };
}

export type FiltroId = "todos" | "acertando" | "medias" | "fallando" | "pendientes";

export const FILTROS: { id: FiltroId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "acertando", label: "Acertando" },
  { id: "medias", label: "A medias" },
  { id: "fallando", label: "Fallando" },
  { id: "pendientes", label: "Sin medir" },
];

/** ¿Esta fila entra en ese filtro? "pendientes" junta madurando y sin datos. */
export function pasaFiltro(f: FilaMedible, filtro: FiltroId): boolean {
  if (filtro === "todos") return true;
  const { clave } = estadoDe(f);
  if (filtro === "pendientes") return clave === "madurando" || clave === "sinDatos";
  return clave === filtro;
}

/** Cuántas filas hay en cada filtro, para poner el número en el chip. */
export function contarPorFiltro<T extends FilaMedible>(filas: T[]): Record<FiltroId, number> {
  const out = { todos: filas.length, acertando: 0, medias: 0, fallando: 0, pendientes: 0 } as Record<FiltroId, number>;
  for (const f of filas) {
    const { clave } = estadoDe(f);
    if (clave === "madurando" || clave === "sinDatos") out.pendientes += 1;
    else out[clave] += 1;
  }
  return out;
}
