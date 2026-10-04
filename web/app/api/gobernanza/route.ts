// GET /api/gobernanza?ticker=INTC — el agente GOV (Gobernanza).
//
// Tres piezas, todas de fuentes gratis y primarias:
//   · directivos comprando o vendiendo  → Finnhub (Form 4 de la SEC)
//   · eventos importantes (8-K)          → data.sec.gov/submissions
//   · demandas                           → dinero apartado (XBRL de la SEC) y
//                                          avisos 8-K que hablan de demandas
// Cada lectura trae el enlace a su filing en sec.gov.
//
// Los fondos (ETF como SPY o QQQ) no tienen directivos ni demandas propias: se
// dice así en vez de devolver una lectura vacía.

import {
  eventos8K, lecturaGobernanza, resumenInsiders,
  type Demandas, type Filing, type TransaccionInsider,
} from "@/lib/agenteGobernanza";
import { cik10, empresaSec, secJson, urlFiling } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ETFS = new Set(["SPY", "QQQ", "IWM", "DIA", "XSP", "SPX", "NDX", "RUT", "VIX", "TLT", "GLD", "UUP", "SMH", "XLK", "XLF", "XLE"]);

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function insiders(ticker: string, hoy: Date): Promise<TransaccionInsider[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const desde = iso(new Date(hoy.getTime() - 120 * 86_400_000));
  const r = await fetch(
    `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&from=${desde}&to=${iso(hoy)}&token=${key}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { data?: TransaccionInsider[] } | null;
  return j?.data ?? null;
}

async function filings(cik: number): Promise<Filing[] | null> {
  const j = await secJson<{ filings: { recent: {
    form: string[]; filingDate: string[]; items: string[]; accessionNumber: string[]; primaryDocument: string[];
  } } }>(`https://data.sec.gov/submissions/CIK${cik10(cik)}.json`).catch(() => null);
  if (!j) return null;
  const r = j.filings.recent;
  return r.form.map((form, k) => ({
    form, filingDate: r.filingDate[k], items: r.items[k] ?? "",
    url: urlFiling(cik, r.accessionNumber[k], r.primaryDocument[k]),
  }));
}

interface Hecho { end: string; val: number; form: string; filed: string }

async function apartadoDemandas(cik: number): Promise<Pick<Demandas, "apartadoAhora" | "apartadoAntes" | "fecha">> {
  const vacio = { apartadoAhora: null, apartadoAntes: null, fecha: null };
  const j = await secJson<{ units?: { USD?: Hecho[] } }>(
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10(cik)}/us-gaap/LossContingencyAccrualAtCarryingValue.json`,
  ).catch(() => null);
  const hechos = (j?.units?.USD ?? []).filter((h) => /^10-[KQ]/.test(h.form)).sort((a, b) => a.end.localeCompare(b.end));
  if (hechos.length === 0) return vacio;
  const ultimo = hechos[hechos.length - 1];
  const haceUnAno = new Date(new Date(`${ultimo.end}T12:00:00Z`).getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const antes = hechos.filter((h) => h.end <= haceUnAno).pop() ?? null;
  return { apartadoAhora: ultimo.val, apartadoAntes: antes?.val ?? null, fecha: ultimo.end };
}

async function avisosLegales(cik: number, hoy: Date): Promise<Demandas["avisos"]> {
  const desde = iso(new Date(hoy.getTime() - 180 * 86_400_000));
  const q = encodeURIComponent('lawsuit OR subpoena OR "class action" OR indictment');
  const j = await secJson<{ hits?: { hits?: { _id: string; _source: { file_date: string } }[] } }>(
    `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=8-K&ciks=${cik10(cik)}&dateRange=custom&startdt=${desde}&enddt=${iso(hoy)}`,
  ).catch(() => null);
  const vistos = new Set<string>();
  const out: Demandas["avisos"] = [];
  for (const h of j?.hits?.hits ?? []) {
    const [adsh, doc] = h._id.split(":");
    if (vistos.has(adsh)) continue;
    vistos.add(adsh);
    out.push({ fecha: h._source.file_date, url: urlFiling(cik, adsh, doc ?? "") });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const hoy = new Date();

  const empresa = ETFS.has(ticker) ? null : await empresaSec(ticker).catch(() => null);
  if (!empresa) {
    return Response.json({
      gobernanza: {
        senal: "No aplica",
        tono: "neutral",
        viendo: `${ticker} es un fondo o un índice, no una empresa: no tiene directivos, junta ni demandas propias que vigilar.`,
        empuje: "Para esto mira las empresas grandes que tiene adentro.",
        detalles: [],
        fuentes: [],
      },
    });
  }

  const [tx, fs, apartado, avisos] = await Promise.all([
    insiders(ticker, hoy),
    filings(empresa.cik),
    apartadoDemandas(empresa.cik),
    avisosLegales(empresa.cik, hoy),
  ]);

  const lectura = lecturaGobernanza({
    ticker,
    insiders: tx ? resumenInsiders(tx, hoy) : null,
    eventos: fs ? eventos8K(fs, hoy) : null,
    demandas: { ...apartado, avisos },
    enlaceInsiders: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${empresa.cik}&type=4&owner=include&count=40`,
  });

  return Response.json({ gobernanza: lectura, empresa: empresa.nombre });
}
