// ============================================================================
// Gamma Skew — la ASIMETRÍA de la gamma: ¿hacia qué lado está "engrasado" el
// precio? El régimen dice si hoy se acelera; el skew dice hacia DÓNDE se
// acelera más. Para daytrading es la señal de "sigo en el trade o me salgo":
// si vas a favor del lado engrasado, deja correr; si vas en contra, cuida el
// stop.
//
// Se calcula con lo que Nagimi ya tiene: el GEX neto por strike (netGex),
// el flip y el precio. netGex < 0 = gamma que ACELERA (dealers cortos gamma);
// netGex > 0 = gamma que FRENA (vuelve al centro). El "lado engrasado" es
// donde se concentra la gamma que acelera. Puro y testable.
// ============================================================================

export interface SkewNode {
  strike: number;
  netGex: number;
}

export interface GammaSkew {
  /** Gamma que acelera acumulada por debajo del precio (≥0). */
  aceleraAbajo: number;
  /** Gamma que acelera acumulada por encima del precio (≥0). */
  aceleraArriba: number;
  /** "abajo" | "arriba" | "parejo": dónde el precio se resbala más rápido. */
  ladoEngrasado: "abajo" | "arriba" | "parejo";
  /** Qué tan cargado hacia un lado, 0-100 (50 = parejo). */
  sesgoPct: number;
  /** Distancia al punto de flip en % del precio (negativo = flip por debajo). */
  distFlipPct: number | null;
  /** Lectura en llano orientada a "sigo o me salgo". */
  lectura: string;
}

/** Hace falta este % en un lado para llamarlo "engrasado"; si no, es parejo. */
const UMBRAL_SESGO = 60;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function gammaSkew(
  nodes: SkewNode[],
  spot: number,
  flipStrike: number | null,
): GammaSkew {
  let aceleraAbajo = 0;
  let aceleraArriba = 0;

  for (const n of nodes) {
    if (!(n.strike > 0) || n.strike === spot) continue;
    // Solo cuenta la gamma que ACELERA (netGex negativo).
    const acelera = n.netGex < 0 ? -n.netGex : 0;
    if (acelera === 0) continue;
    if (n.strike < spot) aceleraAbajo += acelera;
    else aceleraArriba += acelera;
  }

  const total = aceleraAbajo + aceleraArriba;
  // % de la gamma-que-acelera que está del lado de ABAJO.
  const pctAbajo = total > 0 ? (aceleraAbajo / total) * 100 : 50;

  let ladoEngrasado: GammaSkew["ladoEngrasado"] = "parejo";
  if (pctAbajo >= UMBRAL_SESGO) ladoEngrasado = "abajo";
  else if (100 - pctAbajo >= UMBRAL_SESGO) ladoEngrasado = "arriba";

  // Sesgo 0-100: 50 parejo, >50 cargado abajo, <50 cargado arriba → lo
  // normalizamos a "qué tan lejos del centro", del lado que sea.
  const sesgoPct = Math.round(Math.abs(pctAbajo - 50) * 2);

  const distFlipPct = flipStrike != null && spot > 0
    ? round2(((flipStrike - spot) / spot) * 100)
    : null;

  return {
    aceleraAbajo: round2(aceleraAbajo),
    aceleraArriba: round2(aceleraArriba),
    ladoEngrasado,
    sesgoPct,
    distFlipPct,
    lectura: redactar(ladoEngrasado, total),
  };
}

function redactar(lado: GammaSkew["ladoEngrasado"], total: number): string {
  if (total === 0) {
    return "Hoy no hay gamma que acelere de forma clara en ningún lado — los movimientos "
      + "no tienen un lado engrasado. El skew no manda nada especial ahora mismo.";
  }
  if (lado === "abajo") {
    return "El lado engrasado hoy es el de ABAJO: si el precio empieza a caer, tiende a "
      + "caer más rápido; una subida encuentra más freno. Si estás corto/bajista, deja "
      + "correr con stop dinámico. Si estás largo/alcista, vas contra el lado resbaloso — "
      + "cuida el stop y no te enamores.";
  }
  if (lado === "arriba") {
    return "El lado engrasado hoy es el de ARRIBA: si el precio empieza a subir, tiende a "
      + "acelerar; una caída encuentra más freno. Si estás largo/alcista, deja correr con "
      + "stop dinámico. Si estás corto/bajista, vas contra el lado resbaloso — cuida el stop.";
  }
  return "La gamma que acelera está pareja entre arriba y abajo: ningún lado está más "
    + "engrasado que el otro. El precio se puede mover a cualquier lado con la misma "
    + "facilidad — no bases la decisión de salir solo en el skew hoy.";
}
