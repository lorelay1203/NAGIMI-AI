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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Lectura { senal: string; tono: "up" | "down" | "neutral"; viendo: string; empuje: string }

/** Cuántas horas hace de la noticia más reciente. */
function horasDesde(iso: string | undefined, ahora: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (ahora.getTime() - t) / 3_600_000 : null;
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
      const r = await buildNewsReport(ticker, null, ahora).catch(() => null);
      if (!r) return null;
      const propias = [...r.company, ...r.promoted];
      if (propias.length === 0) {
        return {
          senal: "Sin noticias", tono: "neutral",
          viendo: `No hay titulares de ${ticker} en las fuentes de Nagimi ahora mismo.`,
          empuje: "Sin noticias no hay nada que contradiga ni que confirme el flujo. Ojo: que no haya titulares no significa que no esté pasando nada.",
        };
      }
      const b = r.bias;
      const tono = b.bias === "bullish" ? "up" : b.bias === "bearish" ? "down" : "neutral";
      const senal = b.bias === "bullish" ? "Noticias a favor"
        : b.bias === "bearish" ? "Noticias en contra"
        : b.bias === "mixed" ? "Noticias mezcladas" : "Noticias neutrales";

      const masReciente = propias
        .map((n) => n.publishedUtc)
        .sort()
        .reverse()[0];
      const horas = horasDesde(masReciente, ahora);
      const frescura = horas == null ? ""
        : horas < 6 ? ` La más reciente es de hace ${Math.max(1, Math.round(horas))} h.`
        : horas < 48 ? ` La más reciente es de hace ${Math.round(horas)} h.`
        : ` ⚠ La más reciente ya tiene ${Math.round(horas / 24)} días: son noticias viejas, no las uses como razón para entrar hoy.`;

      const viendo = `${propias.length} titulares de ${ticker} · ${b.positive} a favor, ${b.negative} en contra, `
        + `${b.neutral} neutrales (${r.feedsOk} de ${r.feedsTotal} fuentes respondieron).${frescura}`;

      const empuje = b.bias === "mixed"
        ? "Hay titulares de los dos lados: el sentimiento no decide nada hoy, mira el flujo y los muros."
        : b.bias === "neutral"
          ? "El tono de las noticias no inclina la balanza."
          : `El tono general es ${b.bias === "bullish" ? "positivo" : "negativo"}. Si el flujo de opciones apunta al lado contrario, hazle caso al flujo: el dinero se mueve antes que los titulares.`;

      return { senal, tono, viendo, empuje };
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
