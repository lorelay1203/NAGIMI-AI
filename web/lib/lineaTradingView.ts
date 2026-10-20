// ============================================================================
// La "línea para TradingView": los niveles de GEX y el flow de Nagimi en una
// sola línea de texto que se pega en el script "Nagimi Flow Pro" de TradingView.
//
// TradingView no puede leer el open interest de cada strike, así que el GEX
// tiene que llegar desde afuera. Formato (clave=valor separados por "|"):
//
//   NAGIMI v1|t=SPY|d=2026-10-20|cw=777.24|pw=772.25|mag=779.73|flip=772.74|reg=+|fb=58|g=770:-1.2,775:3.4
//
//   t    ticker para el que valen los niveles (ya pasados al ETF si vienen del índice)
//   d    fecha (Nueva York) de los niveles — el script solo los usa ese día
//   cw / pw / mag / flip   call wall, put wall, imán y punto de cambio
//   reg  "+" día de rango (gamma positiva) · "-" día de empujón (negativa)
//   fb   % del dinero de opciones que empuja hacia ARRIBA (0-100), si se pudo medir
//   g    perfil de GEX: strike:valor en millones, los strikes más fuertes cerca del precio
//
// PURO: los datos entran ya leídos; aquí solo se arma el texto.
// ============================================================================

export const VERSION_LINEA = "NAGIMI v1";

export interface DatosLinea {
  ticker: string;
  /** Fecha de los niveles en Nueva York, YYYY-MM-DD. */
  fecha: string;
  spot: number;
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  gammaFlip: number | null;
  regime: "positive" | "negative";
  /** % del flow que empuja hacia arriba (0-100), o null si no se pudo medir. */
  flujoAlcistaPct: number | null;
  bars: { strike: number; netGex: number }[];
}

/** Cuántos strikes del perfil se mandan como máximo (la línea no debe crecer sin control). */
export const MAX_BARRAS = 14;
/** Solo strikes a esta distancia del precio (±4%). */
export const VENTANA_PERFIL = 0.04;

const num = (x: number) => String(Math.round(x * 100) / 100);

/** Fecha YYYY-MM-DD en Nueva York. */
export function fechaNY(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

/** Elige los strikes más fuertes cerca del precio, ordenados por strike. */
export function perfilCompacto(bars: DatosLinea["bars"], spot: number): DatosLinea["bars"] {
  if (!(spot > 0)) return [];
  return bars
    .filter((b) => Number.isFinite(b.strike) && Number.isFinite(b.netGex) && b.netGex !== 0)
    .filter((b) => Math.abs(b.strike - spot) / spot <= VENTANA_PERFIL)
    .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
    .slice(0, MAX_BARRAS)
    .sort((a, b) => a.strike - b.strike);
}

export function armarLineaTradingView(d: DatosLinea): string {
  const partes: string[] = [VERSION_LINEA, `t=${d.ticker.trim().toUpperCase()}`, `d=${d.fecha}`];
  if (d.callWall != null) partes.push(`cw=${num(d.callWall)}`);
  if (d.putWall != null) partes.push(`pw=${num(d.putWall)}`);
  if (d.magnet != null) partes.push(`mag=${num(d.magnet)}`);
  if (d.gammaFlip != null) partes.push(`flip=${num(d.gammaFlip)}`);
  partes.push(`reg=${d.regime === "positive" ? "+" : "-"}`);
  if (d.flujoAlcistaPct != null && Number.isFinite(d.flujoAlcistaPct)) {
    partes.push(`fb=${Math.round(Math.min(100, Math.max(0, d.flujoAlcistaPct)))}`);
  }
  const perfil = perfilCompacto(d.bars, d.spot);
  if (perfil.length > 0) {
    // En millones con un decimal: el script solo necesita el tamaño relativo.
    partes.push(`g=${perfil.map((b) => `${num(b.strike)}:${(Math.round(b.netGex / 1e5) / 10).toFixed(1)}`).join(",")}`);
  }
  return partes.join("|");
}

/** Lee una línea (lo mismo que hace el script de TradingView). Sirve para las pruebas. */
export function leerLineaTradingView(linea: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of linea.trim().split("|")) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  }
  return out;
}
