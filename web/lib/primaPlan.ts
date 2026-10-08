// Servidor: arma el plan de venta de prima 0DTE de un ticker con todo lo que
// la pantalla necesita — muros (en SPY/QQQ, los del índice), los spreads, el
// precio real y el chequeo de reglas de oro. Lo usan /api/prima y
// /api/prima/alternativas.

import { getTicketChain, type TicketChainSource } from "./ticketChain";
import { buildCreditPlan, elegirSpot, type CreditPlan, type SpreadCandidate } from "./creditSpread0dte";
import { nivelesConEspejo } from "./nivelesEspejoServidor";
import type { InfoEspejo } from "./nivelesEspejo";
import { minutosNY, revisarReglasPrima, type ResultadoReglas } from "./reglasOro";

export interface PlanPrima extends CreditPlan {
  spotNiveles: number;
  spotFuente: "cadena" | "niveles";
  desfasePct: number | null;
  expiration: string;
  chainSource: string;
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  asOf: string;
  espejo: InfoEspejo | null;
  avisoEspejo: string | null;
  reglasOro: ResultadoReglas;
  /** El que Nagimi propone: el mejor que cabe y no tiene precio viejo. */
  mejor: SpreadCandidate | null;
  /** El mercado está cerrado y las opciones no tienen precio todavía. */
  sinPrecios: boolean;
}

export async function armarPlanPrima(
  ticker: string,
  capital: number,
  opts: { propios?: boolean; source?: TicketChainSource } = {},
): Promise<PlanPrima> {
  const [{ levels, avisoEspejo }, chain] = await Promise.all([
    nivelesConEspejo(ticker, opts.propios ?? false),
    getTicketChain(ticker, opts.source),
  ]);
  if (!levels || !(levels.spot > 0)) throw new Error(`No se pudieron leer los niveles de ${ticker}.`);
  if (chain.rows.length === 0) throw new Error(`No se pudo leer la cadena de ${ticker}.`);

  // El precio de los niveles llega en velas de 5 minutos; en 0DTE eso ya es
  // viejo. Se saca el precio real de la misma cadena (paridad put-call).
  const precio = elegirSpot(chain.rows, levels.spot);

  const plan = buildCreditPlan(ticker, chain.rows, {
    spot: precio.spot,
    callWall: levels.callWall,
    putWall: levels.putWall,
    regimen: levels.regime,
    capital,
  });

  const mejor = plan.candidatos.find((c) => c.cabe && !c.sospechoso) ?? null;

  // Antes de abrir (o ya cerrado) las opciones no tienen comprador: eso no es
  // "la prima se derritió", es que el mercado no está abierto. Se dice así.
  const min = minutosNY(new Date());
  const cerrado = min < 570 || min >= 960;
  const sinPrecios = plan.candidatos.length === 0
    && plan.descartados.length > 0 && plan.descartados.every((d) => d.motivo.startsWith("nadie lo compra"));
  const sinPreciosHoy = cerrado && sinPrecios;
  if (sinPreciosHoy) {
    plan.aviso = "Las opciones todavía no tienen precio de compra y venta (abren a las 9:30 AM hora de Nueva York). Vuelve a mirar cuando abra el mercado — mejor después de las 10:30.";
  }

  // IV del contrato más pegado al dinero: dice si la prima viene gorda o flaca.
  const atm = chain.rows
    .filter((r) => r.iv != null && r.iv > 0)
    .sort((a, b) => Math.abs(a.strike - precio.spot) - Math.abs(b.strike - precio.spot))[0];

  const reglasOro = revisarReglasPrima({
    ticker, espejoDe: levels.espejo?.indice ?? null,
    spot: precio.spot, fuenteGex: levels.source, netGex: levels.netGex,
    gammaFlip: levels.gammaFlip, magnet: levels.magnet, callWall: levels.callWall, putWall: levels.putWall,
    bars: levels.bars, ahora: new Date(),
    regimen: levels.regime,
    ivAtm: atm?.iv ?? null,
    spread: mejor ? {
      lado: mejor.lado, vender: mejor.vender, comprar: mejor.comprar,
      popPct: mejor.popPct, esperanza: mejor.esperanza, trasElMuro: mejor.trasElMuro,
    } : null,
  });

  return {
    ...plan,
    aviso: [precio.aviso, plan.aviso].filter(Boolean).join(" ") || null,
    spotNiveles: levels.spot,
    spotFuente: precio.fuente,
    desfasePct: precio.desfasePct,
    expiration: chain.expiration,
    chainSource: chain.source,
    callWall: levels.callWall,
    putWall: levels.putWall,
    magnet: levels.magnet,
    asOf: levels.asOf,
    espejo: levels.espejo ?? null,
    avisoEspejo,
    reglasOro,
    mejor,
    sinPrecios: sinPreciosHoy,
  };
}
