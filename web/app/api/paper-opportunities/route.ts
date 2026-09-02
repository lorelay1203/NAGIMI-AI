// GET /api/paper-opportunities
//
// Toma el diario en papel y responde lo que hace falta para DECIDIR HOY:
//   · Si entras ahora, qué podría pasar (coste, ganancia y pérdida máximas, POP).
//   · Cuáles ya vencieron o ya corrieron — para sacarlas de en medio.
//   · En cuál de tus cuentas reales (Tastytrade / Schwab-TOS) te alcanza.
//
// Solo lectura: no abre ni cierra nada.

import { listPaper } from "@/lib/paper";
import { evaluarOportunidad, etToday, porQueDeLaOportunidad, vencimientoDe, type PrecioPata } from "@/lib/paperOpportunity";
import { encajeEnCuentas, getSaldos } from "@/lib/balances";
import { quoteContract } from "@/lib/marketsnackChain";
import { fetchSchwabChain } from "@/lib/schwabMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Precios de las patas: MarketSnack primero; si falla, la cadena de Schwab. */
async function preciosDe(ticker: string, legs: { type: string; strike?: number; expiration?: string }[]) {
  const necesarias = legs.filter((l) => l.type !== "stock" && l.strike != null && l.expiration);
  const out: PrecioPata[] = [];

  const desdeMs = await Promise.all(necesarias.map(async (l) => {
    try {
      const q = await quoteContract(ticker, l.type as "call" | "put", l.strike!, l.expiration!);
      return q && q.mid > 0 ? { strike: l.strike!, type: l.type as "call" | "put", mid: q.mid } : null;
    } catch { return null; }
  }));
  for (const p of desdeMs) if (p) out.push(p);
  if (out.length === necesarias.length) return out;

  // Respaldo: una sola llamada a Schwab cubre todas las patas que falten.
  try {
    const chain = await fetchSchwabChain(ticker, 30);
    for (const l of necesarias) {
      if (out.some((p) => p.strike === l.strike && p.type === l.type)) continue;
      const c = chain.contracts.find((x) =>
        x.details?.strike_price === l.strike &&
        x.details?.contract_type === l.type &&
        x.details?.expiration_date === l.expiration);
      const bid = c?.quote?.bid, ask = c?.quote?.ask;
      if (bid != null && ask != null && ask > 0) {
        out.push({ strike: l.strike!, type: l.type as "call" | "put", mid: (bid + ask) / 2 });
      }
    }
  } catch { /* sin respaldo: se reporta como "sin precio" */ }
  return out;
}

export async function GET() {
  try {
    const [trades, saldos] = await Promise.all([listPaper(), getSaldos()]);
    const abiertos = trades.filter((t) => t.status === "open");
    const hoy = etToday();

    const oportunidades = await Promise.all(abiertos.map(async (t) => {
      const exp = vencimientoDe(t);
      // Lo vencido no necesita precios: se resuelve por fecha y ahorra llamadas.
      if (exp && exp < hoy) {
        const o = evaluarOportunidad(t, [], 0, 0.2, hoy);
        return { ...o, encaje: null, porQue: porQueDeLaOportunidad(o, hoy), rationale: t.rationale ?? null };
      }
      const precios = await preciosDe(t.ticker, t.legs);
      // El spot se aproxima con el strike medio: solo se usa para la forma del
      // payoff, y las patas ya vienen valoradas a precio real.
      const strikes = t.legs.map((l) => l.strike).filter((s): s is number => s != null);
      const spot = t.entrySpot ?? (strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : 0);
      const o = evaluarOportunidad(t, precios, spot, 0.25, hoy);
      const encaje = o.desembolso != null ? encajeEnCuentas(o.desembolso, saldos) : null;
      // El razonamiento de hoy + el porqué que guardó el motor cuando la encontró.
      const porQue = porQueDeLaOportunidad(o, hoy);
      if (encaje) {
        porQue.push({
          titulo: "¿Te alcanza el dinero?",
          señal: encaje.cabe ? "ok" : "no",
          detalle: encaje.resumen,
        });
      }
      return { ...o, encaje, porQue, rationale: t.rationale ?? null };
    }));

    // Orden: primero lo que se puede hacer y menos tiempo queda.
    const rank = { entrable: 0, sin_precio: 1, ya_corrio: 2, vencido: 3 } as const;
    oportunidades.sort((a, b) => (rank[a.estado] - rank[b.estado]) || (a.dias - b.dias));

    const entrables = oportunidades.filter((o) => o.estado === "entrable");
    return Response.json({
      hoy,
      saldos,
      oportunidades,
      resumen: {
        total: oportunidades.length,
        entrables: entrables.length,
        alcanzan: entrables.filter((o) => o.encaje?.cabe).length,
        vencidas: oportunidades.filter((o) => o.estado === "vencido").length,
        yaCorrieron: oportunidades.filter((o) => o.estado === "ya_corrio").length,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudieron leer las oportunidades." },
      { status: 502 },
    );
  }
}
