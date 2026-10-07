// GET /api/suministro?ticker=NVDA — el agente SUP (Cadena de suministro), PARCIAL.
//
// Tres piezas, todas de la SEC (gratis y primarias):
//   · cuánto depende de sus clientes más grandes → texto del último 10-K
//   · inventario contra ventas                  → XBRL (InventoryNet y ventas)
//   · avisos 8-K de aranceles/exportación/escasez → búsqueda de texto de la SEC
// y lib/agenteSuministro.ts arma la lectura. El mapa real de proveedores no
// está en el plan de datos: la lectura lo dice.

import {
  concentracionClientes, inventarioVsVentas, lecturaSuministro, textoPlano, type HechoXbrl,
} from "@/lib/agenteSuministro";
import { cik10, empresaSec, secJson, urlFiling } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FONDOS = new Set(["SPY", "QQQ", "IWM", "DIA", "XSP", "SPX", "NDX", "RUT", "VIX", "TLT", "GLD", "UUP", "SMH", "XLK", "XLF", "XLE"]);
const UA = { "User-Agent": "Nagimi AI research (lorelaytoro@gmail.com)" };
const UN_DIA = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** El 10-K pesa varios MB y cambia una vez al año: se guarda lo que importa por un día. */
const memoria10K = new Map<number, { cuando: number; v: { fecha: string; url: string; texto: string } | null }>();

async function ultimo10K(cik: number): Promise<{ fecha: string; url: string; texto: string } | null> {
  const g = memoria10K.get(cik);
  if (g && Date.now() - g.cuando < UN_DIA) return g.v;
  const sub = await secJson<{ filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] } } }>(
    `https://data.sec.gov/submissions/CIK${cik10(cik)}.json`,
  ).catch(() => null);
  const r = sub?.filings.recent;
  const k = r ? r.form.findIndex((f) => f === "10-K") : -1;
  if (!r || k < 0) { memoria10K.set(cik, { cuando: Date.now(), v: null }); return null; }
  const url = urlFiling(cik, r.accessionNumber[k], r.primaryDocument[k]);
  const html = await fetch(url, { headers: UA, cache: "no-store" }).then((x) => (x.ok ? x.text() : "")).catch(() => "");
  const v = html ? { fecha: r.filingDate[k], url, texto: textoPlano(html) } : null;
  memoria10K.set(cik, { cuando: Date.now(), v });
  return v;
}

async function concepto(cik: number, nombre: string): Promise<HechoXbrl[]> {
  const j = await secJson<{ units?: { USD?: HechoXbrl[] } }>(
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10(cik)}/us-gaap/${nombre}.json`,
  ).catch(() => null);
  return j?.units?.USD ?? [];
}

/** Las ventas se reportan con distintos nombres según la empresa: se usa el que tenga datos más recientes. */
async function ventas(cik: number): Promise<HechoXbrl[]> {
  const opciones = await Promise.all([
    concepto(cik, "RevenueFromContractWithCustomerExcludingAssessedTax"),
    concepto(cik, "Revenues"),
    concepto(cik, "SalesRevenueNet"),
  ]);
  const ultimo = (xs: HechoXbrl[]) => xs.reduce((m, h) => (h.end > m ? h.end : m), "");
  return opciones.sort((a, b) => ultimo(b).localeCompare(ultimo(a)))[0] ?? [];
}

async function avisosSuministro(cik: number, hoy: Date): Promise<{ fecha: string; url: string }[]> {
  const desde = iso(new Date(hoy.getTime() - 180 * 86_400_000));
  const q = encodeURIComponent('"export controls" OR tariffs OR "supply constraints" OR shortage');
  const j = await secJson<{ hits?: { hits?: { _id: string; _source: { file_date: string; items?: string[] } }[] } }>(
    `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=8-K&ciks=${cik10(cik)}&dateRange=custom&startdt=${desde}&enddt=${iso(hoy)}`,
  ).catch(() => null);
  const vistos = new Set<string>();
  const out: { fecha: string; url: string }[] = [];
  for (const h of j?.hits?.hits ?? []) {
    // Los comunicados de resultados (item 2.02) siempre mencionan aranceles o
    // exportación de pasada: no son un aviso de problema, se saltan.
    if (h._source.items?.includes("2.02")) continue;
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

  const empresa = FONDOS.has(ticker) ? null : await empresaSec(ticker).catch(() => null);
  if (!empresa) {
    return Response.json({
      suministro: {
        senal: "No aplica", tono: "neutral",
        viendo: `${ticker} es un fondo o un índice: no tiene clientes, proveedores ni inventario propios.`,
        empuje: "Para esto mira las empresas grandes que tiene adentro.",
        detalles: [], fuentes: [],
      },
    });
  }

  const [k10, inv, vts, avisos] = await Promise.all([
    ultimo10K(empresa.cik),
    concepto(empresa.cik, "InventoryNet"),
    ventas(empresa.cik),
    avisosSuministro(empresa.cik, hoy),
  ]);

  const lectura = lecturaSuministro({
    ticker,
    concentracion: k10 ? concentracionClientes(k10.texto) : null,
    reporteAnual: k10 ? { fecha: k10.fecha, url: k10.url } : null,
    inventario: inventarioVsVentas(inv, vts),
    avisos,
  });

  return Response.json({ suministro: lectura, empresa: empresa.nombre });
}
