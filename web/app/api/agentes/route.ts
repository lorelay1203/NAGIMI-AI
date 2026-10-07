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
import { lecturaMarcos, marcos } from "@/lib/agenteMarcos";
import { fetchBars } from "@/lib/massive";
import { cambioPct, lecturaMacro, PROXIES } from "@/lib/agenteMacro";
import { lecturaSector, sectorDe } from "@/lib/agenteSector";
import { buildNewsReport } from "@/lib/news";
import { lecturaSentimiento, tonoAnalistas, tonoNoticias, type MesAnalistas } from "@/lib/agenteSentimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Lectura { senal: string; tono: "up" | "down" | "neutral"; viendo: string; empuje: string; detalles?: string[] }

/** Industria de la empresa según Finnhub ("Semiconductors", "Banking"…). Cache de un día. */
const industrias = new Map<string, { cuando: number; v: string | null }>();
async function industria(ticker: string): Promise<string | null> {
  const g = industrias.get(ticker);
  if (g && Date.now() - g.cuando < 24 * 60 * 60 * 1000) return g.v;
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key}`, { cache: "no-store" })
    .catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { finnhubIndustry?: string } | null;
  const v = j?.finnhubIndustry || null;
  industrias.set(ticker, { cuando: Date.now(), v });
  return v;
}

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
      const [velas, niveles, horas] = await Promise.all([
        cachedDailyBars(ticker, 365, ahora).catch(() => []),
        getDayGex(ticker).catch(() => null),
        fetchBars(ticker, 60, "minute", 14).catch(() => []),
      ]);
      const l = lecturaTecnica({
        velas: velas.map((v) => ({ high: v.high, low: v.low, close: v.close })),
        suelo: niveles?.putWall ?? null,
        techo: niveles?.callWall ?? null,
      });
      if (!l) return null;

      // Marcos de tiempo: semanal, diario y por hora. Si chocan, la señal lo
      // dice y el tono baja a neutral: la tendencia diaria sola no basta.
      const mt = lecturaMarcos(marcos(
        velas.map((v) => ({ time: v.time, close: v.close })),
        horas.map((h) => ({ time: h.time, close: h.close })),
      ));
      const chocan = mt.acuerdo === "chocan";
      return {
        senal: chocan ? `${l.senal} (los marcos chocan)` : mt.acuerdo === "coinciden" && l.tono !== "neutral" ? `${l.senal} en todos los marcos` : l.senal,
        tono: chocan ? "neutral" : l.tono,
        viendo: l.viendo,
        empuje: l.empuje,
        detalles: [mt.linea, mt.consejo].filter(Boolean),
      };
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
      if (!l) return null;

      // El sector: la industria de Finnhub → su fondo de sector, comparado con
      // el mercado en las mismas 20 sesiones, y el ticker contra su sector.
      const sector = sectorDe(await industria(ticker));
      const [velasSector, velasTicker, velasSpy] = await Promise.all([
        sector ? cachedDailyBars(sector.etf, 365, ahora).catch(() => []) : Promise.resolve([]),
        cachedDailyBars(ticker, 365, ahora).catch(() => []),
        cachedDailyBars("SPY", 365, ahora).catch(() => []),
      ]);
      const s = lecturaSector({
        ticker, sector, sesiones: 20,
        cambioTicker: cambioPct(velasTicker.map((b) => b.close), 20),
        cambioSector: cambioPct(velasSector.map((b) => b.close), 20),
        cambioMercado: l.cambios.SPY,
        fechaDatos: velasSpy.at(-1)?.time ?? null,
      });

      // El sector mueve la señal solo cuando el ambiente general no decide, o
      // cuando va en contra del ambiente (se dice el choque).
      const tono = l.tono === "neutral" && s.puntos !== 0 ? (s.puntos > 0 ? "up" : "down") : l.tono;
      const senal = l.tono === "up" && s.puntos < 0 ? "Viento a favor, pero su sector se queda atrás"
        : l.tono === "down" && s.puntos > 0 ? "Viento en contra, pero su sector aguanta"
          : l.tono === "neutral" && s.puntos > 0 ? "Mercado de lado, sector a favor"
            : l.tono === "neutral" && s.puntos < 0 ? "Mercado de lado, sector en contra"
              : l.senal;
      return {
        senal, tono,
        viendo: s.resumen ? `${l.viendo.replace(/\.$/, "")}; ${s.resumen}.` : l.viendo,
        empuje: l.empuje,
        detalles: s.detalles,
      };
    })(),
  ]);

  return Response.json({ ticker, tecnico, sentimiento, macro });
}
