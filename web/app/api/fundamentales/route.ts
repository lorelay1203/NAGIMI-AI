// GET /api/fundamentales?ticker=INTC — el agente FND (Fundamentales), versión
// para opciones.
//
// Pide a Finnhub las métricas de la empresa (salen de sus 10-K/10-Q) y las de
// hasta 8 competidores (`stock/peers`), y se las pasa a lib/agenteFundamentales.ts,
// que separa lo REPORTADO de lo ESTIMADO y compara contra la mitad del grupo.
//
// Los fondos (SPY, QQQ…) no tienen ventas ni ganancias propias: "No aplica".

import { lecturaFundamentales, medianaPares, metricasDeFinnhub, type Metricas } from "@/lib/agenteFundamentales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FONDOS = new Set(["SPY", "QQQ", "IWM", "DIA", "XSP", "SPX", "NDX", "RUT", "VIX", "TLT", "GLD", "UUP", "SMH", "XLK", "XLF", "XLE"]);
const MAX_PARES = 8;

/** Métricas de un ticker; se guardan 6 horas (cambian una vez por trimestre). */
const memoria = new Map<string, { cuando: number; m: Metricas | null }>();
const SEIS_HORAS = 6 * 60 * 60 * 1000;

async function metricas(ticker: string, key: string): Promise<Metricas | null> {
  const guardado = memoria.get(ticker);
  if (guardado && Date.now() - guardado.cuando < SEIS_HORAS) return guardado.m;
  const r = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${key}`, { cache: "no-store" })
    .catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  const m = metricasDeFinnhub(ticker, j);
  if (r && r.ok) memoria.set(ticker, { cuando: Date.now(), m });
  return m;
}

async function pares(ticker: string, key: string): Promise<string[]> {
  const r = await fetch(`https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(ticker)}&token=${key}`, { cache: "no-store" })
    .catch(() => null);
  const j = r && r.ok ? ((await r.json().catch(() => [])) as string[]) : [];
  return (Array.isArray(j) ? j : []).filter((t) => t && t !== ticker && !t.includes(".")).slice(0, MAX_PARES);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });

  if (FONDOS.has(ticker)) {
    return Response.json({
      fundamentales: {
        senal: "No aplica", tono: "neutral",
        viendo: `${ticker} es un fondo o un índice: no tiene ventas, ganancias ni deuda propias.`,
        empuje: "Para esto mira las empresas grandes que tiene adentro.",
        detalles: [],
      },
    });
  }

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ fundamentales: null, error: "Falta la clave de Finnhub." });

  const [propias, lista] = await Promise.all([metricas(ticker, key), pares(ticker, key)]);
  if (!propias) return Response.json({ fundamentales: null });

  const deLosPares = (await Promise.all(lista.map((t) => metricas(t, key)))).filter((x): x is Metricas => x != null);
  const grupo = deLosPares.length > 0 ? medianaPares(deLosPares) : null;

  return Response.json({ fundamentales: lecturaFundamentales(propias, grupo) });
}
