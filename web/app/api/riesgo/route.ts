// GET /api/riesgo?ticker=NVDA — el agente RSK (Riesgo) completo.
//
// Junta cinco piezas y se las pasa a lib/agenteRiesgo.ts:
//   · hacia dónde resbala el precio (gamma skew, con los muros del día),
//   · si hay gente negociando los contratos (cadena del vencimiento más cercano),
//   · cuánto se mueve con el mercado (velas diarias del ticker y de SPY),
//   · hasta dónde puede caer en un día/semana mala (nerviosismo de la cadena),
//   · qué tan confiable es todo lo anterior (qué se pudo leer y de dónde).
//
// Lo que falle se manda vacío y baja la confianza; nunca se rellena.

import { getDayGex } from "@/lib/dayGex";
import { fetchMsChainGex } from "@/lib/marketsnackChain";
import { gammaSkew } from "@/lib/gammaSkew";
import { getTicketChain } from "@/lib/ticketChain";
import { cachedDailyBars } from "@/lib/barsStore";
import {
  betaContra, confianza, escenarioBaja, lecturaRiesgo, liquidezCadena, type Entrada,
} from "@/lib/agenteRiesgo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MERCADO = "SPY";

const INDICES = new Set(["SPX", "NDX", "RUT", "VIX", "XSP"]);

/** De dónde salió un dato y qué tan atrasado viene, en palabras. */
function notaFuente(fuente: string, ticker: string): string {
  if (fuente === "marketsnack") return "MarketSnack (unos 5 min de atraso)";
  if (fuente === "schwab") return INDICES.has(ticker) ? "Schwab (en índices puede venir atrasado)" : "Schwab";
  if (fuente === "massive") return "Massive (con atraso)";
  return fuente;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const ahora = new Date();

  const [niveles, cadena, velasTk, velasMk] = await Promise.all([
    getDayGex(ticker).catch(() => null),
    getTicketChain(ticker).catch(() => null),
    cachedDailyBars(ticker, 120, ahora).catch(() => []),
    ticker === MERCADO ? Promise.resolve(null) : cachedDailyBars(MERCADO, 120, ahora).catch(() => []),
  ]);

  const spot = niveles?.spot ?? 0;

  // Resbala: con el perfil por precio del día; si la fuente no lo dio
  // (MarketSnack), con la cadena por precio de MarketSnack.
  let nodos = (niveles?.bars ?? []).map((b) => ({ strike: b.strike, netGex: b.netGex }));
  if (nodos.length === 0 && spot > 0) {
    const h = await fetchMsChainGex(ticker, spot).catch(() => null);
    nodos = (h?.strikes ?? []).map((s) => ({ strike: s.strike, netGex: s.netGex }));
  }
  const skew = nodos.length > 0 && spot > 0 ? gammaSkew(nodos, spot, niveles?.gammaFlip ?? null) : null;

  const liquidez = cadena && spot > 0 ? liquidezCadena(cadena.rows, spot) : null;

  // Nerviosismo: el de los muros si lo trae; si no, el del contrato más
  // cercano al precio en la cadena.
  let iv = niveles?.iv ?? null;
  if ((iv == null || !(iv > 0)) && cadena && spot > 0) {
    const atm = cadena.rows
      .filter((r) => r.iv != null && r.iv > 0)
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
    iv = atm?.iv ?? null;
  }
  const baja = spot > 0 ? escenarioBaja(spot, iv, niveles?.putWall ?? null) : null;

  const beta = velasMk === null
    ? { beta: 1, parecido: 1, dias: 0 }   // el ticker ES el mercado
    : betaContra(velasTk, velasMk);

  const entradas: Entrada[] = [
    { que: "los muros del día", ok: niveles != null && spot > 0, nota: niveles ? notaFuente(niveles.source, ticker) : undefined },
    { que: "hacia dónde resbala", ok: skew != null },
    { que: "la cadena de contratos", ok: liquidez != null, nota: cadena ? notaFuente(cadena.source, ticker) : undefined },
    { que: "las velas diarias", ok: beta != null },
    { que: "el nerviosismo", ok: baja != null },
  ];

  const lectura = lecturaRiesgo({
    ticker, skew, liquidez, beta, mercado: MERCADO, baja,
    diaDeEmpujon: niveles ? niveles.regime === "negative" : null,
    confianza: confianza(entradas),
  });

  return Response.json({ riesgo: lectura, asOf: niveles?.asOf ?? ahora.toISOString() });
}
