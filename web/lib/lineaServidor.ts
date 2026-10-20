// Servidor: arma la "Línea de Nagimi" de un ticker con los datos de ahora.
// La usan /api/tradingview/linea (el botón) y el vigía de muros (los avisos).

import { nivelesConEspejo } from "./nivelesEspejoServidor";
import { getDayGex } from "./dayGex";
import { flowContext } from "./flowContext";
import { armarLineaTradingView, fechaNY, type DatosLinea } from "./lineaTradingView";

export interface LineaTicker {
  linea: string;
  datos: DatosLinea;
  espejoDe: string | null;
  avisoEspejo: string | null;
  fuente: string;
  asOf: string;
}

export async function armarLineaDeTicker(ticker: string, propios = false): Promise<LineaTicker> {
  const t = ticker.trim().toUpperCase();
  const [{ levels, avisoEspejo }, flujo] = await Promise.all([
    nivelesConEspejo(t, propios),
    flowContext(t).catch(() => null),
  ]);

  // El perfil por strike: MarketSnack da los muros ya calculados pero no las
  // barras; si faltan, se piden a Schwab (del índice si los muros son espejo,
  // pasando los strikes a precios del ETF con la misma proporción).
  let bars = levels.bars.map((b) => ({ strike: b.strike, netGex: b.netGex }));
  if (bars.length === 0) {
    const base = levels.espejo?.indice ?? t;
    const k = levels.espejo?.ratio ?? 1;
    const sch = await getDayGex(base, "schwab").catch(() => null);
    if (sch) bars = sch.bars.map((b) => ({ strike: Math.round(b.strike * k * 100) / 100, netGex: b.netGex }));
  }

  const bull = flujo?.ctx.bull ?? 0;
  const bear = flujo?.ctx.bear ?? 0;
  const datos: DatosLinea = {
    ticker: t,
    fecha: fechaNY(new Date()),
    spot: levels.spot,
    callWall: levels.callWall,
    putWall: levels.putWall,
    magnet: levels.magnet,
    gammaFlip: levels.gammaFlip,
    regime: levels.regime,
    flujoAlcistaPct: bull + bear > 0 ? (bull / (bull + bear)) * 100 : null,
    bars,
  };

  return {
    linea: armarLineaTradingView(datos),
    datos,
    espejoDe: levels.espejo?.indice ?? null,
    avisoEspejo,
    fuente: levels.source,
    asOf: levels.asOf,
  };
}
