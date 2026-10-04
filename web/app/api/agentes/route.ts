// GET /api/agentes?ticker=NVDA
//
// Los agentes de contexto que se calculan sin el escaneo de flujo:
//   TCH Técnicos     — tendencia, momentum, volatilidad y nivel de invalidación
//   SNT Sentimiento  — qué dicen las noticias y si están frescas
//   MAC Macro        — el ambiente (mercado, tasas, dólar, oro)
//
// Cada uno devuelve null si le faltan datos: nunca una lectura inventada.

import { cachedDailyBars } from "@/lib/barsStore";
import { getDayGex } from "@/lib/dayGex";
import { lecturaTecnica } from "@/lib/agenteTecnico";
import { lecturaMacro, PROXIES } from "@/lib/agenteMacro";
import { buildNewsReport } from "@/lib/news";
import { lecturaSentimiento, tonoAnalistas, tonoNoticias, type MesAnalistas } from "@/lib/agenteSentimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Lectura { senal: string; tono: "up" | "down" | "neutral"; viendo: string; empuje: string; detalles?: string[] }

/** Opinión de los analistas mes a mes (Finnhub). null si no hay clave o falla. */
async function recomendaciones(ticker: string): Promise<MesAnalistas[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(ticker)}&token=${key}`, { cache: "no-store" })
    .catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as MesAnalistas[] | null;
  return Array.isArray(j) && j.length > 0 ? j : null;
}


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const ahora = new Date();

  const [tecnico, sentimiento, macro] = await Promise.all([
    (async (): Promise<Lectura | null> => {
      const [velas, niveles] = await Promise.all([
        cachedDailyBars(ticker, 365, ahora).catch(() => []),
        getDayGex(ticker).catch(() => null),
      ]);
      const l = lecturaTecnica({
        velas: velas.map((v) => ({ high: v.high, low: v.low, close: v.close })),
        suelo: niveles?.putWall ?? null,
        techo: niveles?.callWall ?? null,
      });
      return l ? { senal: l.senal, tono: l.tono, viendo: l.viendo, empuje: l.empuje } : null;
    })(),

    (async (): Promise<Lectura | null> => {
      const [r, recs] = await Promise.all([
        buildNewsReport(ticker, null, ahora).catch(() => null),
        recomendaciones(ticker),
      ]);
      const propias = r ? [...r.company, ...r.promoted] : [];
      const noticias = tonoNoticias(
        propias.map((n) => ({ publisher: n.publisher, publishedUtc: n.publishedUtc, sentiment: n.sentiment })),
        ahora,
      );
      const analistas = recs ? tonoAnalistas(recs) : null;
      const l = lecturaSentimiento({
        ticker, noticias, analistas, feedsOk: r?.feedsOk, feedsTotal: r?.feedsTotal,
      });
      if (l) return l;
      if (!r) return null;
      return {
        senal: "Sin noticias", tono: "neutral",
        viendo: `No hay titulares de ${ticker} ni opinión de analistas en las fuentes de Nagimi ahora mismo.`,
        empuje: "Sin noticias no hay nada que contradiga ni que confirme el flujo. Ojo: que no haya titulares no significa que no esté pasando nada.",
      };
    })(),

    (async (): Promise<Lectura | null> => {
      const series: Record<string, number[]> = {};
      await Promise.all(PROXIES.map(async (p) => {
        const bars = await cachedDailyBars(p.ticker, 365, ahora).catch(() => []);
        series[p.ticker] = bars.map((b) => b.close);
      }));
      const l = lecturaMacro(series);
      return l ? { senal: l.senal, tono: l.tono, viendo: l.viendo, empuje: l.empuje } : null;
    })(),
  ]);

  return Response.json({ ticker, tecnico, sentimiento, macro });
}
