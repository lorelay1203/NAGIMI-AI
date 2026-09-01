import { describe, expect, it } from "vitest";
import {
  parseSchwabChain, parseExpirationKey, schwabSymbol, toOccTicker, toRawContract,
  type SchwabChainResponse, type SchwabOption,
} from "./schwabMarket";
import { toRow } from "./compute";

function opt(o: Partial<SchwabOption>): SchwabOption {
  return {
    putCall: "CALL", symbol: "SPY   260901C00748000", bid: 14.86, ask: 15.07,
    last: 16.02, mark: 14.97, totalVolume: 28, openInterest: 124, volatility: 39.74,
    delta: 0.994, gamma: 0.003, theta: -1.107, vega: 0.003, rho: 0.01,
    strikePrice: 748, multiplier: 100, ...o,
  };
}
function chain(calls: SchwabOption[], puts: SchwabOption[] = [], exp = "2026-09-01:0"): SchwabChainResponse {
  // Ojo: un mismo strike puede traer VARIOS contratos (p.ej. SPX y SPXW el día
  // del vencimiento mensual), así que se acumulan en la lista, no se pisan.
  const map = (list: SchwabOption[]) => {
    const out: Record<string, Record<string, SchwabOption[]>> = { [exp]: {} };
    for (const o of list) (out[exp][String(o.strikePrice)] ??= []).push(o);
    return out;
  };
  return { symbol: "SPY", underlyingPrice: 761.79, isDelayed: false,
    callExpDateMap: map(calls), putExpDateMap: puts.length ? map(puts) : undefined };
}

describe("schwabSymbol", () => {
  it("los índices llevan $ delante", () => {
    expect(schwabSymbol("SPX")).toBe("$SPX");
    expect(schwabSymbol("VIX")).toBe("$VIX");
    expect(schwabSymbol("NDX")).toBe("$NDX");
  });
  it("las acciones y ETFs van tal cual", () => {
    expect(schwabSymbol("SPY")).toBe("SPY");
    expect(schwabSymbol(" nvda ")).toBe("NVDA");
  });
});

describe("parseExpirationKey / toOccTicker", () => {
  it("recorta el sufijo de la clave de vencimiento", () => {
    expect(parseExpirationKey("2026-09-18:17")).toBe("2026-09-18");
  });
  it("quita los espacios del símbolo de Schwab", () => {
    expect(toOccTicker("SPY   260901C00748000")).toBe("O:SPY260901C00748000");
    expect(toOccTicker(undefined)).toBe("");
  });
});

describe("toRawContract", () => {
  it("convierte al formato que ya consume toRow", () => {
    const r = toRawContract(opt({}), "2026-09-01", "SPY", 761.79);
    expect(r.details).toMatchObject({ contract_type: "call", expiration_date: "2026-09-01", strike_price: 748 });
    expect(r.open_interest).toBe(124);
    expect(r.day?.volume).toBe(28);
    // El puente clave: la fila de Nagimi sale bien formada.
    const row = toRow(r);
    expect(row).toMatchObject({ contractType: "call", strike: 748, openInterest: 124, volume: 28 });
  });

  it("pasa la IV de porcentaje a decimal", () => {
    expect(toRawContract(opt({ volatility: 39.74 }), "2026-09-01", "SPY", 700).greeks?.iv).toBeCloseTo(0.3974, 4);
  });

  it("descarta los centinelas de Schwab (-999) en vez de tomarlos como número", () => {
    const r = toRawContract(opt({ delta: -999, gamma: -999, volatility: -999 }), "2026-09-01", "SPY", 700);
    expect(r.greeks?.delta).toBeNull();
    expect(r.greeks?.gamma).toBeNull();
    expect(r.greeks?.iv).toBeNull();
  });

  it("un bid/ask de 0 significa 'sin cotización', no precio cero", () => {
    const r = toRawContract(opt({ bid: 0, ask: 0 }), "2026-09-01", "SPY", 700);
    expect(r.quote?.bid).toBeUndefined();
    expect(r.quote?.ask).toBeUndefined();
  });

  it("distingue puts de calls", () => {
    expect(toRawContract(opt({ putCall: "PUT" }), "2026-09-01", "SPY", 700).details?.contract_type).toBe("put");
  });
});

describe("parseSchwabChain", () => {
  it("aplana calls y puts, y saca el precio del subyacente", () => {
    const r = parseSchwabChain(chain(
      [opt({ strikePrice: 748 }), opt({ strikePrice: 750 })],
      [opt({ putCall: "PUT", strikePrice: 748, symbol: "SPY   260901P00748000" })],
    ), "SPY");
    expect(r.contracts).toHaveLength(3);
    expect(r.underlyingPrice).toBe(761.79);
    expect(r.expirationCount).toBe(1);
    expect(r.delayed).toBe(false);
  });

  it("una respuesta vacía no revienta", () => {
    const r = parseSchwabChain({}, "SPY");
    expect(r.contracts).toEqual([]);
    expect(r.underlyingPrice).toBeNull();
  });

  // El día del vencimiento mensual, SPX trae la serie semanal (SPXW, la que se
  // opera) y la mensual (SPX, ya liquidada). Sumar las dos falsea los muros.
  it("en SPX se queda solo con la serie SPXW cuando existe", () => {
    const r = parseSchwabChain(chain([
      opt({ symbol: "SPXW  260901C07600000", strikePrice: 7600 }),
      opt({ symbol: "SPX   260901C07600000", strikePrice: 7600, openInterest: 99999 }),
    ]), "SPX");
    expect(r.contracts).toHaveLength(1);
    expect(r.contracts[0].details?.ticker).toBe("O:SPXW260901C07600000");
  });

  it("si SPX no trae SPXW, conserva lo que haya", () => {
    const r = parseSchwabChain(chain([opt({ symbol: "SPX   261218C07600000", strikePrice: 7600 })]), "SPX");
    expect(r.contracts).toHaveLength(1);
  });

  it("en tickers normales no filtra nada", () => {
    const r = parseSchwabChain(chain([opt({ strikePrice: 748 }), opt({ strikePrice: 750 })]), "SPY");
    expect(r.contracts).toHaveLength(2);
  });
});
