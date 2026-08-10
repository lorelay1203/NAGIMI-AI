// Radar de descubrimiento — dos lentes sobre el flujo de opciones de TODO el mercado:
//  · mode=discover : grandes trades (market_big_delta_trades) agregados por acción + dirección,
//                    excluyendo mega-caps para resaltar nombres nuevos / poco famosos.
//  · mode=lowcost  : contratos baratos que más se movieron hoy (market_top_mover_low_cost_contracts),
//                    filtrable por rango de precio ($0-1, $1-5, $5-10). Ideal para capital chico.

import { NextResponse } from "next/server";
import { parseOcc } from "@/lib/occ";
import { msFetch as msFetchAuto } from "@/lib/marketsnackFetch";
import { getMarketsnackCookie } from "@/lib/marketsnackCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://app.marketsnack.com";

const FAMOUS = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "SPX", "NDX", "VIX",
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOG", "GOOGL", "META", "AMD",
  "NFLX", "INTC", "AVGO", "JPM", "BAC", "BABA", "PLTR",
  "SOXL", "TQQQ", "SQQQ", "SOXS", "SPXL", "TSLL", "UVXY", "SVIX",
]);

const RANGES = new Set(["0-1", "1-5", "5-10"]);

interface Trade { symbol: string; premium: number }
interface LowCost { symbol: string; price: number; return_percentage: number; today_premium: number; volume: number; price_change?: { percentage?: number } }
interface Agg { ticker: string; callPrem: number; putPrem: number; total: number; count: number }

// Usa el fetch compartido: cookie runtime + auto-relogin y reintento si caducó.
async function msFetch(url: string) {
  const res = await msFetchAuto(url);
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    return { err: NextResponse.json({ error: "Sesión de MarketSnack inválida o expirada. Renueva la cookie (o activa el auto-login) en /cookie." }, { status: 401 }) };
  }
  if (!res.ok) return { err: NextResponse.json({ error: `MarketSnack respondió ${res.status}.` }, { status: 502 }) };
  return { json: await res.json() };
}

export async function GET(req: Request) {
  if (!getMarketsnackCookie()) return NextResponse.json({ error: "Falta la cookie de MarketSnack. Renuévala o activa el auto-login en /cookie." }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") === "lowcost" ? "lowcost" : "discover";

  try {
    if (mode === "lowcost") {
      const range = RANGES.has(sp.get("range") ?? "") ? sp.get("range")! : "1-5";
      const url = `${BASE}/api/widgets/market_top_mover_low_cost_contracts?filter%5Bexclude%5D%5B%5D=indices&filter%5Bprice_range%5D=${range}`;
      const r = await msFetch(url);
      if (r.err) return r.err;
      const list: LowCost[] = Array.isArray(r.json) ? r.json : (r.json.list ?? r.json.data ?? []);
      const rows = list.map((c) => {
        const occ = parseOcc(c.symbol);
        return {
          ticker: occ?.underlying ?? c.symbol,
          type: occ?.type ?? null,
          strike: occ?.strike ?? null,
          expiry: occ?.expiration ?? null,
          price: c.price,
          retPct: Math.round(c.return_percentage ?? c.price_change?.percentage ?? 0),
          premium: c.today_premium ?? 0,
          volume: c.volume ?? 0,
        };
      });
      return NextResponse.json({ mode, range, rows, asOf: new Date().toISOString() });
    }

    // mode === "discover"
    const byTicker = new Map<string, Agg>();
    let token: string | null = null;
    let pages = 0;
    do {
      pages += 1;
      const params = new URLSearchParams();
      params.append("filter[exclude][]", "indices");
      params.set("limit", "25");
      if (token) params.set("next_page_token", token);
      const r = await msFetch(`${BASE}/api/widgets/market_big_delta_trades?${params.toString()}`);
      if (r.err) return r.err;
      const list: Trade[] = r.json.list ?? [];
      for (const t of list) {
        const occ = parseOcc(t.symbol);
        if (!occ || FAMOUS.has(occ.underlying)) continue;
        const a = byTicker.get(occ.underlying) ?? { ticker: occ.underlying, callPrem: 0, putPrem: 0, total: 0, count: 0 };
        const prem = t.premium || 0;
        if (occ.type === "call") a.callPrem += prem; else a.putPrem += prem;
        a.total += prem; a.count += 1;
        byTicker.set(occ.underlying, a);
      }
      token = r.json.meta?.next_page_token ?? null;
    } while (token && pages < 4);

    const rows = [...byTicker.values()]
      .map((a) => {
        const net = a.callPrem - a.putPrem;
        const share = a.total > 0 ? Math.abs(net) / a.total : 0;
        const direction: "up" | "down" | "mixed" = share < 0.25 ? "mixed" : net > 0 ? "up" : "down";
        return { ...a, direction, callPct: a.total > 0 ? Math.round((a.callPrem / a.total) * 100) : 0 };
      })
      .sort((x, y) => y.total - x.total)
      .slice(0, 12);

    return NextResponse.json({ mode, rows, scanned: pages, asOf: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fallo de red con MarketSnack." }, { status: 502 });
  }
}
