// ============================================================================
// Muros "espejo": los niveles de GEX del ÍNDICE pasados al ETF.
//
// Los muros funcionan mejor en los índices que se liquidan en efectivo (SPX,
// NDX): ahí el que provee liquidez tiene que cuadrar sus libros cada día. Pero
// un contrato de SPX cuesta cientos o miles de dólares. La salida: leer los
// muros en el índice y operarlos en su ETF, que se mueve igual pero cuesta
// ~10 veces menos (SPY ≈ SPX ÷ 10; QQQ ≈ NDX ÷ 41).
//
// Se convierte con la proporción entre los dos precios. Si la proporción en
// vivo se aleja mucho de la del último cierre, lo más probable es que uno de
// los dos precios venga atrasado (pasa con el SPX de Schwab), y se usa la del
// cierre. Todo PURO para poder probarlo.
// ============================================================================

import type { DayGexLevels } from "./dayGex";

/** De qué índice se toman los muros para cada ETF. */
export const INDICE_DE: Record<string, string> = { SPY: "SPX", QQQ: "NDX" };

export function indiceEspejo(ticker: string): string | null {
  return INDICE_DE[ticker.trim().toUpperCase()] ?? null;
}

/** Cuánto se puede alejar la proporción en vivo de la del cierre (0.3%). */
export const TOLERANCIA_RATIO = 0.003;

export interface Proporcion {
  ratio: number;
  /** "vivo" = precios de ahora; "cierre" = se desconfió del vivo y se usó el del último cierre. */
  origen: "vivo" | "cierre";
}

/**
 * Elige la proporción ETF ÷ índice. Prefiere la de ahora; si no cuadra con la
 * del último cierre (un precio atrasado), usa la del cierre.
 */
export function elegirProporcion(vivo: number | null, cierre: number | null): Proporcion | null {
  const ok = (x: number | null): x is number => x != null && Number.isFinite(x) && x > 0;
  if (ok(vivo) && ok(cierre)) {
    return Math.abs(vivo - cierre) / cierre <= TOLERANCIA_RATIO
      ? { ratio: vivo, origen: "vivo" }
      : { ratio: cierre, origen: "cierre" };
  }
  if (ok(vivo)) return { ratio: vivo, origen: "vivo" };
  if (ok(cierre)) return { ratio: cierre, origen: "cierre" };
  return null;
}

export interface InfoEspejo {
  indice: string;
  ratio: number;
  origen: "vivo" | "cierre";
  /** Niveles originales en el índice, para mostrarlos al lado. */
  original: { spot: number; callWall: number | null; putWall: number | null; magnet: number | null; gammaFlip: number | null };
}

export type NivelesConEspejo = DayGexLevels & { espejo?: InfoEspejo };

const r2 = (x: number) => Math.round(x * 100) / 100;
const conv = (x: number | null, k: number) => (x == null ? null : r2(x * k));

/**
 * Pasa los muros del índice al ETF. El precio del ETF es el REAL (no el del
 * índice escalado): así el ticket mide distancias con el precio que se opera.
 * El GEX total se queda en la escala del índice (es lo que se compara con 2B,
 * 3B, 20B…).
 */
export function convertirNiveles(
  indice: DayGexLevels,
  etf: string,
  spotEtf: number,
  prop: Proporcion,
): NivelesConEspejo {
  const k = prop.ratio;
  return {
    ...indice,
    ticker: etf.trim().toUpperCase(),
    spot: spotEtf,
    callWall: conv(indice.callWall, k),
    putWall: conv(indice.putWall, k),
    magnet: conv(indice.magnet, k),
    gammaFlip: conv(indice.gammaFlip, k),
    maxPain: conv(indice.maxPain, k),
    bars: indice.bars.map((b) => ({ ...b, strike: r2(b.strike * k) })),
    espejo: {
      indice: indice.ticker,
      ratio: k,
      origen: prop.origen,
      original: {
        spot: indice.spot, callWall: indice.callWall, putWall: indice.putWall,
        magnet: indice.magnet, gammaFlip: indice.gammaFlip,
      },
    },
  };
}
