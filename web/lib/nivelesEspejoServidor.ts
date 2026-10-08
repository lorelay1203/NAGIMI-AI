// Servidor: los muros del día, en SPY/QQQ tomados del índice (SPX/NDX) y
// pasados a precios del ETF. La conversión en sí es pura y vive en
// lib/nivelesEspejo.ts; aquí solo se piden los datos.

import { getDayGex } from "./dayGex";
import { convertirNiveles, elegirProporcion, indiceEspejo, type NivelesConEspejo } from "./nivelesEspejo";
import { fetchSchwabDailyCloses, fetchSchwabQuote } from "./schwabMarket";

/**
 * Niveles del día para operar (ticket y venta de prima). En SPY y QQQ, por defecto se usan los muros del
 * ÍNDICE (SPX / NDX) pasados a precios del ETF: ahí los muros funcionan mejor y
 * el contrato del ETF cuesta ~10 veces menos. `propios` fuerza los del ETF.
 * Si el índice falla, se cae a los propios y se avisa.
 */
export async function nivelesConEspejo(ticker: string, propios: boolean): Promise<{ levels: NivelesConEspejo; avisoEspejo: string | null }> {
  const idx = propios ? null : indiceEspejo(ticker);
  if (!idx) return { levels: await getDayGex(ticker), avisoEspejo: null };
  try {
    const [ind, spotEtf, cierresEtf, cierresIdx] = await Promise.all([
      getDayGex(idx),
      fetchSchwabQuote(ticker).catch(() => null),
      fetchSchwabDailyCloses(ticker, 5).catch(() => [] as number[]),
      fetchSchwabDailyCloses(idx, 5).catch(() => [] as number[]),
    ]);
    const spot = spotEtf ?? (await getDayGex(ticker)).spot;
    const ce = cierresEtf[cierresEtf.length - 1], ci = cierresIdx[cierresIdx.length - 1];
    const prop = elegirProporcion(spot > 0 && ind.spot > 0 ? spot / ind.spot : null, ce > 0 && ci > 0 ? ce / ci : null);
    if (prop && spot > 0) return { levels: convertirNiveles(ind, ticker, spot, prop), avisoEspejo: null };
  } catch { /* se cae a los muros propios */ }
  return {
    levels: await getDayGex(ticker),
    avisoEspejo: `No se pudieron leer los muros del ${idx}; se usan los propios de ${ticker}.`,
  };
}
