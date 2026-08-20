// ============================================================================
// Fuente UNIFICADA de niveles de GEX para day-trading, CON RESPALDO.
// Prueba las fuentes en orden y usa la primera que responda:
//   1) MarketSnack  — muros ya calculados (call/put wall, imán, max pain, flip).
//                     Necesita la cookie que la usuaria pega en /cookie.
//   2) Massive      — se calcula el GEX desde la cadena de opciones (gexAnalysis).
//                     Key PERMANENTE, sin cookie, nunca saca de la sesión.
// Devuelve siempre el MISMO shape (DayGexLevels), diga qué fuente lo dio.
//
// (QuantData quedó descartado como fuente automática: su GEX está encerrado en
//  los widgets del dashboard de la usuaria y venía vacío — ver memoria.)
// ============================================================================

import { fetchMsGex } from "./marketsnackGex";
import { fetchOptionChain, fetchDailyBars, fetchCompany } from "./massive";
import { toRow } from "./compute";
import { gexAnalysis } from "./gex";

export type GexSource = "marketsnack" | "massive";

export interface GexBar {
  strike: number;
  callGex: number; // magnitud gamma de calls (≥0)
  putGex: number;  // magnitud gamma de puts (≥0)
  netGex: number;  // callGex − putGex
}

export interface DayGexLevels {
  ticker: string;
  source: GexSource;
  spot: number;
  callWall: number | null;   // resistencia: strike con más gamma de calls
  putWall: number | null;    // soporte: strike con más gamma de puts
  magnet: number | null;     // imán: nodo de mayor concentración
  gammaFlip: number | null;  // zona donde el GEX cambia de signo
  maxPain: number | null;    // solo lo da MarketSnack
  netGex: number;
  regime: "positive" | "negative"; // + = mercado pegajoso/rango · − = volátil/tendencia
  bars: GexBar[];            // perfil por strike (vacío si la fuente no lo da)
  asOf: string;              // ISO
}

/** Trae los niveles de GEX del día probando MarketSnack y luego Massive. */
export async function getDayGex(ticker: string): Promise<DayGexLevels> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new Error("Ticker vacío.");

  const errors: string[] = [];

  // ── 1) MarketSnack (muros ya calculados; requiere cookie) ──
  try {
    const ms = await fetchMsGex(clean);
    const s = ms.latest;
    if (s && s.assetPrice > 0) {
      return {
        ticker: clean,
        source: "marketsnack",
        spot: s.assetPrice,
        callWall: s.callWall || null,
        putWall: s.putWall || null,
        magnet: s.magnet || null,
        gammaFlip: s.gammaFlip || null,
        maxPain: s.maxPain || null,
        netGex: s.netGex ?? 0,
        regime: (s.netGex ?? 0) >= 0 ? "positive" : "negative",
        bars: [],
        asOf: s.t || new Date().toISOString(),
      };
    }
    errors.push("MarketSnack: sin datos recientes.");
  } catch (e) {
    errors.push(`MarketSnack: ${e instanceof Error ? e.message : e}`);
  }

  // ── 2) Massive (calcula el GEX desde la cadena; key permanente, sin cookie) ──
  try {
    return await massiveDayGex(clean);
  } catch (e) {
    errors.push(`Massive: ${e instanceof Error ? e.message : e}`);
  }

  throw new Error(`No se pudo obtener el GEX de ${clean}. ${errors.join(" · ")}`);
}

/** Calcula los niveles desde la cadena de opciones de Massive. */
async function massiveDayGex(ticker: string): Promise<DayGexLevels> {
  const [chain, bars] = await Promise.all([
    fetchOptionChain(ticker),
    fetchDailyBars(ticker, 60).catch(() => []),
  ]);
  const rows = chain.contracts.map(toRow);
  if (rows.length === 0) throw new Error("cadena de opciones vacía.");

  let spot = chain.underlyingPrice ?? 0;
  if (spot <= 0) {
    const company = await fetchCompany(ticker).catch(() => null);
    spot = company?.price ?? (bars.length ? bars[bars.length - 1].close : 0);
  }
  if (spot <= 0) throw new Error("sin precio del subyacente.");

  const gex = gexAnalysis({
    rows,
    closes: bars.map((b) => b.close),
    spot,
    now: new Date(),
  });
  if (gex.nodes.length === 0) throw new Error("no se pudo calcular el GEX (sin nodos).");

  // Perfil por strike + muros (call wall = más gamma de calls; put wall = más de puts).
  const bars2: GexBar[] = gex.nodes
    .map((n) => ({ strike: n.strike, callGex: n.callGex, putGex: n.putGex, netGex: n.netGex }))
    .sort((a, b) => a.strike - b.strike);

  let callWall: number | null = null, putWall: number | null = null;
  let maxCall = 0, maxPut = 0;
  for (const b of bars2) {
    if (b.callGex > maxCall) { maxCall = b.callGex; callWall = b.strike; }
    if (b.putGex > maxPut) { maxPut = b.putGex; putWall = b.strike; }
  }

  return {
    ticker,
    source: "massive",
    spot,
    callWall,
    putWall,
    magnet: gex.kingStrike,
    gammaFlip: gex.flipStrike,
    maxPain: null,
    netGex: gex.totalNetGex,
    regime: gex.regime,
    bars: bars2,
    asOf: new Date().toISOString(),
  };
}
