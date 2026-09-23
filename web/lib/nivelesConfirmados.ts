// ============================================================================
// Niveles CONFIRMADOS por varios vencimientos.
//
// Hasta ahora Nagimi decía "el techo está en $230" y ya. Pero un techo no es
// solo un número: importa en cuántos vencimientos aparece. Si el mismo strike
// es el muro de calls en el vencimiento de 16 días, en el de 23 y en el de 30,
// hay tres bloques de dinero defendiendo ese precio. Si solo sale en uno, es
// mucho más fácil que lo rompan.
//
// (La idea viene de la vista Support/Resistance de la página de referencia, que
// escribe los niveles así: `S 220 • 16d/23d/30d`. Aquí se calcula con la gamma
// por celda que Nagimi ya tiene, no con un número suelto.)
//
// Puro y testable: recibe las celdas del mapa de calor y devuelve los niveles.
// ============================================================================

import { probTouch } from "./expectedMove";

/** Una celda del mapa: un strike dentro de UN vencimiento. */
export interface CeldaNivel {
  strike: number;
  expiration: string;
  callGex: number;
  putGex: number;
}

export interface VencimientoDte {
  expiration: string;
  dte: number;
}

export interface NivelConfirmado {
  strike: number;
  /** "techo" = muro de calls (frena la subida) · "suelo" = muro de puts. */
  lado: "techo" | "suelo";
  /** Los vencimientos donde ESE strike es el muro de su lado. */
  vencimientos: string[];
  dtes: number[];
  /** Cuántos vencimientos lo confirman. 3 aguanta más que 1. */
  veces: number;
  /** Gamma acumulada del strike en esos vencimientos (para desempatar). */
  gex: number;
  distanciaPct: number;
  /** "16d/23d/30d" — como se escribe en la tarjeta. */
  etiqueta: string;
  /** Probabilidad de que el precio lo toque antes del último de sus vencimientos (0-1). */
  probTocar: number | null;
  /** Una línea en llano: qué significa que salga en tantos vencimientos. */
  lectura: string;
}

export interface NivelesConfirmados {
  techos: NivelConfirmado[];
  suelos: NivelConfirmado[];
  /** Cuántos vencimientos se miraron de verdad. */
  vencimientosMirados: number;
}

const VACIO: NivelesConfirmados = { techos: [], suelos: [], vencimientosMirados: 0 };

/** Cuántos vencimientos se miran: más allá del 6º ya no es "la sesión". */
const MAX_VENCIMIENTOS = 6;

function lecturaDe(veces: number, lado: "techo" | "suelo"): string {
  const donde = lado === "techo" ? "la subida" : "la caída";
  if (veces >= 3) {
    return `Aparece en ${veces} vencimientos seguidos: hay varios bloques de dinero defendiendo ese precio, `
      + `así que es donde más probable es que se frene ${donde}.`;
  }
  if (veces === 2) {
    return `Aparece en 2 vencimientos: aguanta, pero no tanto como uno que se repite en tres.`;
  }
  return `Solo aparece en 1 vencimiento: es el más flojo de los tres — si el precio llega con fuerza, `
    + `es el que se rompe primero.`;
}

/**
 * Agrupa los muros por strike y cuenta en cuántos vencimientos se repiten.
 *
 * Para cada vencimiento se busca el strike con más gamma de calls (techo) y el
 * de más gamma de puts (suelo) — la misma regla que usa el resto de Nagimi para
 * los muros del día, pero vencimiento por vencimiento en vez de todo junto.
 */
export function nivelesConfirmados(input: {
  celdas: CeldaNivel[];
  vencimientos: VencimientoDte[];
  spot: number;
  /** IV para la probabilidad de tocar. Sin ella, probTocar va en null. */
  iv?: number | null;
  max?: number;
}): NivelesConfirmados {
  const { celdas, vencimientos, spot } = input;
  if (!(spot > 0) || celdas.length === 0 || vencimientos.length === 0) return VACIO;

  const max = input.max ?? MAX_VENCIMIENTOS;
  const cercanos = [...vencimientos].sort((a, b) => a.dte - b.dte).slice(0, max);
  const dtePorVenc = new Map(cercanos.map((v) => [v.expiration, v.dte]));

  // strike+lado → lo que se va acumulando
  const acumulado = new Map<string, { strike: number; lado: "techo" | "suelo"; vencs: string[]; dtes: number[]; gex: number }>();

  for (const v of cercanos) {
    const deEse = celdas.filter((c) => c.expiration === v.expiration);
    if (deEse.length === 0) continue;

    const mejor = (lado: "techo" | "suelo") => {
      const valor = (c: CeldaNivel) => (lado === "techo" ? c.callGex : c.putGex);
      let ganador: CeldaNivel | null = null;
      for (const c of deEse) {
        if (!(valor(c) > 0)) continue;
        if (!ganador || valor(c) > valor(ganador)) ganador = c;
      }
      return ganador;
    };

    for (const lado of ["techo", "suelo"] as const) {
      const c = mejor(lado);
      if (!c) continue;
      const clave = `${lado}:${c.strike}`;
      const previo = acumulado.get(clave);
      const gex = lado === "techo" ? c.callGex : c.putGex;
      const dte = dtePorVenc.get(v.expiration) ?? 0;
      if (previo) {
        previo.vencs.push(v.expiration);
        previo.dtes.push(dte);
        previo.gex += gex;
      } else {
        acumulado.set(clave, { strike: c.strike, lado, vencs: [v.expiration], dtes: [dte], gex });
      }
    }
  }

  const armar = (lado: "techo" | "suelo"): NivelConfirmado[] =>
    [...acumulado.values()]
      .filter((a) => a.lado === lado)
      .map((a) => {
        const dtes = [...a.dtes].sort((x, y) => x - y);
        // La probabilidad se mide hasta el vencimiento MÁS LEJANO que lo
        // confirma: es la ventana completa en la que ese muro está vivo.
        const dteMax = dtes[dtes.length - 1] ?? 0;
        const iv = input.iv ?? null;
        return {
          strike: a.strike,
          lado,
          vencimientos: a.vencs,
          dtes,
          veces: a.vencs.length,
          gex: a.gex,
          distanciaPct: ((a.strike - spot) / spot) * 100,
          etiqueta: dtes.map((d) => `${d}d`).join("/"),
          probTocar: iv && iv > 0 && dteMax > 0 ? probTouch(spot, a.strike, iv, dteMax) : null,
          lectura: lecturaDe(a.vencs.length, lado),
        };
      })
      // Primero el que más veces se repite; a igualdad, el que tenga más gamma.
      .sort((x, y) => y.veces - x.veces || y.gex - x.gex);

  return { techos: armar("techo"), suelos: armar("suelo"), vencimientosMirados: cercanos.length };
}
