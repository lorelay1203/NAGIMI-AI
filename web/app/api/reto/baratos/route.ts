// GET /api/reto/baratos?saldo=10
//
// "¿Qué me cabe hoy con mi saldo?": busca en varias acciones y ETFs líquidos
// el contrato que cabe con el saldo, hacia el imán del día (los muros), con su
// probabilidad y lo que pagaría si llega. Para el Reto Webull.

import { getDayGex } from "@/lib/dayGex";
import { getTicketChain } from "@/lib/ticketChain";
import { nivelesConEspejo } from "@/lib/nivelesEspejoServidor";
import type { NivelesConEspejo } from "@/lib/nivelesEspejo";
import { elegirBaratos, fraseBarato, type Barato } from "@/lib/contratosBaratos";
import { minutosNY } from "@/lib/reglasOro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Líquidos y con strikes baratos: donde un contrato de $0.02-$0.10 se puede vender de vuelta. */
const TICKERS = ["SPY", "QQQ", "IWM", "TSLA", "NVDA", "AMD", "PLTR", "SOFI"];

/** De a pocos para no ahogar a Schwab/MarketSnack. */
async function enTandas<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...(await Promise.all(items.slice(i, i + n).map(f))));
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const saldo = Number(searchParams.get("saldo") ?? "0");
  if (!(saldo > 0)) return Response.json({ error: "Falta el saldo." }, { status: 400 });

  const filas = await enTandas(TICKERS, 4, async (ticker) => {
    try {
      const [niv, chain0] = await Promise.all([
        ticker === "SPY" || ticker === "QQQ"
          ? nivelesConEspejo(ticker, false).then((x) => x.levels)
          : getDayGex(ticker) as Promise<NivelesConEspejo>,
        getTicketChain(ticker),
      ]);
      const conPrecio = (rows: typeof chain0.rows) => rows.some((r) => r.bid != null && r.bid > 0);
      // Antes de abrir MarketSnack trae los bids en cero; Schwab guarda los
      // del último cierre, que sirven de referencia (y se dice que son de ayer).
      let chain = chain0;
      let preciosDeAyer = false;
      if (!conPrecio(chain0.rows) && chain0.source !== "schwab") {
        const alt = await getTicketChain(ticker, "schwab").catch(() => null);
        if (alt && conPrecio(alt.rows)) { chain = alt; preciosDeAyer = true; }
      }
      const sinPrecios = !conPrecio(chain.rows);
      const elegidos = elegirBaratos(ticker, chain.rows, { spot: niv.spot, meta: niv.magnet, saldo });
      return {
        ticker,
        espejoDe: niv.espejo?.indice ?? null,
        sinPrecios,
        preciosDeAyer,
        expiration: chain.expiration,
        contratos: elegidos.map((b: Barato) => ({ ...b, frase: fraseBarato(b) })),
        error: null as string | null,
      };
    } catch (e) {
      return { ticker, espejoDe: null, sinPrecios: false, preciosDeAyer: false, expiration: null, contratos: [], error: e instanceof Error ? e.message : "No se pudo leer." };
    }
  });

  const min = minutosNY(new Date());
  const abierto = min >= 570 && min < 960;
  return Response.json({ saldo, abierto, filas });
}
