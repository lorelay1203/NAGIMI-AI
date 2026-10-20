// Servidor: hacia dónde va el dinero de opciones hoy en un ticker. Lo usan el
// Ticket del día y la línea para TradingView.

import type { FlowCtx } from "./pinStrategy";
import { fetchFlow } from "./marketsnack";
import { classifyFlow } from "./flow";
import { analyzeMarketPressure } from "./marketPressure";
import { getTtFlow } from "./ttFlow";
import type { FilaFlujo } from "./barridas";

/**
 * Señales de flujo para el filtro de la estrategia.
 *
 * La DIRECCIÓN (cuánto dinero empuja arriba vs abajo) sale de MarketSnack, que
 * sigue siendo la fuente principal; si no hay cookie, del streamer de Tastytrade.
 * La VELOCIDAD solo la puede dar el streamer, porque hace falta una serie de
 * tiempo y MarketSnack entrega una foto.
 *
 * Lo que no se pueda medir se devuelve vacío: el filtro trata lo que falta como
 * "no filtra", nunca como "todo en orden".
 */
export async function flowContext(ticker: string): Promise<{
  ctx: FlowCtx; disponible: boolean; premium: number; fuente: string | null; velocidad: number | null;
  /** Las operaciones del día (MarketSnack), para contar barridas sobre el contrato. */
  filas: FilaFlujo[];
}> {
  // Tastytrade en vivo (si el streamer está corriendo). Es lo ÚNICO que puede
  // medir la velocidad de la cinta, porque guarda una serie de tiempo.
  const tt = await getTtFlow(ticker).catch(() => null);
  const velocidad = tt?.fresco ? tt.velocity : null;

  // Dirección: MarketSnack manda (es la fuente principal).
  try {
    const { trades } = await fetchFlow(ticker, { period: "1d", minPremium: 25_000, maxPages: 6 });
    const { rows } = classifyFlow(trades, new Date());
    if (rows.length > 0) {
      const p = analyzeMarketPressure(rows);
      const bull = p.cross.callsBought + p.cross.putsSold;
      const bear = p.cross.callsSold + p.cross.putsBought;
      if (bull + bear > 0) {
        return {
          ctx: { bull, bear, velocity: velocidad },
          disponible: true, premium: p.side.total,
          fuente: velocidad != null ? "marketsnack+tastytrade" : "marketsnack",
          velocidad, filas: rows,
        };
      }
    }
  } catch { /* sin cookie: se intenta con Tastytrade */ }

  // Sin MarketSnack, el streamer sirve de respaldo para la dirección.
  if (tt?.fresco && tt.bull + tt.bear > 0) {
    return {
      ctx: { bull: tt.bull, bear: tt.bear, velocity: velocidad },
      disponible: true, premium: tt.bull + tt.bear, fuente: "tastytrade", velocidad, filas: [],
    };
  }

  return { ctx: {}, disponible: false, premium: 0, fuente: null, velocidad, filas: [] };
}

