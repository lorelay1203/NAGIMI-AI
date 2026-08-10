// Cliente del GEX de MarketSnack (niveles profesionales ya calculados). Solo servidor.
// Endpoint: /api/assets/{TICKER}/gex_stats_chart?period=1d  → serie intradía con
// call/put wall, imán (magnet), max pain, gamma flip, net GEX y precio.

import { getMarketsnackCookie } from "./marketsnackCookie";
import { msFetch } from "./marketsnackFetch";

const BASE_URL = "https://app.marketsnack.com";

export class MsGexError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MsGexError";
    this.status = status;
  }
}

export interface GexSnapshot {
  netGex: number;
  callWall: number;
  putWall: number;
  magnet: number;
  maxPain: number;
  gammaFlip: number;
  assetPrice: number;
  t: string; // ISO timestamp
}

export interface MsGexResult {
  symbol: string;
  series: GexSnapshot[]; // intradía, en orden
  latest: GexSnapshot | null; // último snapshot = estado actual
}

interface RawSnap {
  net_gex?: number;
  call_wall?: number;
  put_wall?: number;
  magnet?: number;
  max_pain?: number;
  gamma_flip?: number;
  asset_price?: number;
  t?: string;
}

function cookie(): string {
  const c = getMarketsnackCookie();
  if (!c) throw new MsGexError("Falta la cookie de MarketSnack. Renuévala en /cookie.");
  return c;
}

/** Trae la serie de GEX del día para un ticker desde MarketSnack. */
export async function fetchMsGex(ticker: string, period = "1d"): Promise<MsGexResult> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) throw new MsGexError("Ticker vacío.");

  const url = `${BASE_URL}/api/assets/${encodeURIComponent(clean)}/gex_stats_chart?period=${encodeURIComponent(period)}`;
  cookie(); // valida presencia; msFetch la lee fresca y re-loguea si caducó
  const res = await msFetch(url);

  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new MsGexError(
      "Sesión de MarketSnack inválida o expirada. Actualiza MARKETSNACK_COOKIE en .env.local.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new MsGexError(`MarketSnack GEX respondió ${res.status}.`, res.status);
  }

  const json = (await res.json()) as { symbol?: string; data?: RawSnap[] };
  const series: GexSnapshot[] = (json.data ?? [])
    .filter((d) => typeof d.asset_price === "number")
    .map((d) => ({
      netGex: d.net_gex ?? 0,
      callWall: d.call_wall ?? 0,
      putWall: d.put_wall ?? 0,
      magnet: d.magnet ?? 0,
      maxPain: d.max_pain ?? 0,
      gammaFlip: d.gamma_flip ?? 0,
      assetPrice: d.asset_price ?? 0,
      t: d.t ?? "",
    }));

  return {
    symbol: json.symbol ?? clean,
    series,
    latest: series.length ? series[series.length - 1] : null,
  };
}
