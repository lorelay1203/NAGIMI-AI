// 📜 SEC (EDGAR) — acceso gratis a los filings de cualquier empresa de EE.UU.
//
// La SEC no pide clave, pero sí un User-Agent con contacto y como mucho 10
// pedidos por segundo. El mapa ticker → CIK (el número de la empresa en la SEC)
// se baja una vez y se guarda en memoria por un día.

const UA = { "User-Agent": "Nagimi AI research (lorelaytoro@gmail.com)" };
const UN_DIA = 24 * 60 * 60 * 1000;

export class SecError extends Error {}

export async function secJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) throw new SecError(`SEC ${r.status} en ${url}`);
  return (await r.json()) as T;
}

let mapa: { cuando: number; porTicker: Map<string, { cik: number; nombre: string }> } | null = null;

/** CIK y nombre oficial de un ticker, o null si la SEC no lo tiene (p. ej. muchos ETF). */
export async function empresaSec(ticker: string): Promise<{ cik: number; nombre: string } | null> {
  if (!mapa || Date.now() - mapa.cuando > UN_DIA) {
    const j = await secJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
    );
    mapa = {
      cuando: Date.now(),
      porTicker: new Map(Object.values(j).map((v) => [v.ticker.toUpperCase(), { cik: v.cik_str, nombre: v.title }])),
    };
  }
  return mapa.porTicker.get(ticker.trim().toUpperCase().replace(".", "-")) ?? null;
}

/** CIK con los ceros a la izquierda que piden las rutas de data.sec.gov. */
export const cik10 = (cik: number) => String(cik).padStart(10, "0");

/** Enlace al documento de un filing. */
export function urlFiling(cik: number, accession: string, documento: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${documento}`;
}
