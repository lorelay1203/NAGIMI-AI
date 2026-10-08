// GET /api/prima/alternativas?capital=1800
//
// "¿Qué puedo hacer hoy?": arma el plan de venta de prima en SPX, SPY y QQQ a
// la vez y devuelve, de cada uno, lo esencial — el spread que cabe, cuánto
// cobra y arriesga, y si pasa las reglas de oro. Así se comparan las
// alternativas sin ir uno por uno.

import { armarPlanPrima } from "@/lib/primaPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICKERS = ["SPX", "SPY", "QQQ"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capital = Number(searchParams.get("capital") ?? "0");
  if (!(capital > 0)) return Response.json({ error: "Falta el capital disponible." }, { status: 400 });

  const filas = await Promise.all(TICKERS.map(async (ticker) => {
    try {
      const p = await armarPlanPrima(ticker, capital);
      const limpios = p.candidatos.filter((c) => !c.sospechoso);
      const menorRiesgo = limpios.length ? Math.min(...limpios.map((c) => c.riesgoMax)) : null;
      return {
        ticker,
        error: null,
        espejoDe: p.espejo?.indice ?? null,
        regimen: p.regimen,
        mejor: p.mejor,
        sinPrecios: p.sinPrecios,
        caben: limpios.filter((c) => c.cabe).length,
        menorRiesgo,
        veredicto: p.reglasOro.veredicto,
        resumen: p.reglasOro.resumen,
      };
    } catch (e) {
      return {
        ticker, error: e instanceof Error ? e.message : "No se pudo leer.", espejoDe: null, regimen: null,
        mejor: null, sinPrecios: false, caben: 0, menorRiesgo: null, veredicto: null, resumen: null,
      };
    }
  }));

  return Response.json({ capital, filas });
}
