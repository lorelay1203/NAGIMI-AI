// Tipos compartidos entre el cliente de Massive, los cálculos y la UI.

export type ContractType = "call" | "put";

/** Subconjunto del contrato tal como lo devuelve el Option Chain Snapshot de Massive. */
export interface RawContract {
  break_even_price?: number;
  day?: {
    volume?: number;
    close?: number;
    vwap?: number;
  };
  details?: {
    contract_type?: string;
    expiration_date?: string;
    strike_price?: number;
    shares_per_contract?: number;
    ticker?: string;
  };
  last_trade?: {
    price?: number;
  };
  open_interest?: number;
  underlying_asset?: {
    price?: number;
    ticker?: string;
  };
  /** Bid/ask reales. Los da Schwab; Massive en este plan no. Opcional. */
  quote?: {
    bid?: number;
    ask?: number;
  };
  /** Griegas e IV reales del proveedor (Schwab). Opcional: el GEX las calcula
   *  por su cuenta con Black-Scholes, esto es un extra que no se tira. */
  greeks?: ContractGreeks;
}

export interface ContractGreeks {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  /** En DECIMAL (0.39), no en porcentaje. */
  iv: number | null;
}

/** De dónde salió el precio usado para Open Premium (bid no está disponible en este plan). */
export type PriceSource = "last_trade" | "day_close" | "day_vwap" | "none";

/** Fila procesada que consume la tabla. */
export interface Row {
  optionTicker: string;
  contractType: ContractType;
  expiration: string;
  strike: number;
  openInterest: number;
  volume: number;
  price: number | null;
  priceSource: PriceSource;
  openPremium: number | null;
  notionalValue: number;
}

export interface ChainMeta {
  ticker: string;
  underlyingPrice: number | null;
  contractCount: number;
  expirationCount: number;
  pages: number;
  truncated: boolean;
}

/** Información y stats de la empresa (se muestra antes de la tabla). */
export interface CompanyInfo {
  ticker: string;
  name: string | null;
  exchange: string | null;
  marketCap: number | null;
  homepageUrl: string | null;
  employees: number | null;
  listDate: string | null;
  sector: string | null; // sic_description
  description: string | null;
  hasLogo: boolean;
  // stats de precio (stock snapshot)
  price: number | null;
  change: number | null;
  changePercent: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayVolume: number | null;
  prevClose: number | null;
}

/** Barra diaria del subyacente para la gráfica (formato lightweight-charts). */
export interface DailyBar {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Barra con tiempo UNIX (segundos) — sirve para diario e intradía. */
export interface TfBar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---- Eventos SSE ----
export interface StepEvent {
  type: "step";
  label: string;
  detail?: string;
}
export interface CompanyEvent {
  type: "company";
  company: CompanyInfo;
}
export interface DoneEvent {
  type: "done";
  rows: Row[];
  meta: ChainMeta;
  /** Análisis de Acumulación y Rapidez (categoría Estructura). */
  structure?: import("./structure").StructureScore;
  /** Historial diario de la cadena (hasta 45 días, acumulado hacia adelante). */
  history?: import("./chainStore").ChainSnapshot[];
}
export interface ErrorEvent {
  type: "error";
  message: string;
}
export type ChainEvent = StepEvent | CompanyEvent | DoneEvent | ErrorEvent;
