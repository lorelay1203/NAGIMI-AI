// 🧹 Barridas sobre un contrato — "✓ 3 sweeps buying this contract today".
//
// Una barrida (sweep, código OPRA "ISOI") es una orden tan urgente que barre
// varias bolsas a la vez para llenarse ya, pagando lo que haga falta. Es la
// huella típica del dinero grande con prisa. Si hoy hubo barridas COMPRANDO el
// mismo contrato que propone el ticket, alguien con plata está haciendo la
// misma apuesta; si hubo barridas VENDIÉNDOLO, está apostando en contra.
//
// Se compara por tipo + precio pactado + fecha de vencimiento (no por el
// símbolo, porque cada fuente lo escribe distinto: SPX vs SPXW, espacios…).

export interface FilaFlujo {
  type: "call" | "put" | "unknown";
  strike: number | null;
  expiration: string | null;
  aggression: "ask" | "bid" | "mid" | "unknown";
  conditionCode: string | null;
  premium: number;
  timestamp: string;
}

export interface ContratoBuscado {
  type: "call" | "put";
  strike: number;
  expiration: string | null;
}

export interface Barridas {
  /** Barridas pagando lo que piden (comprando con prisa). */
  compras: number;
  /** Barridas aceptando lo que ofrecen (vendiendo con prisa). */
  ventas: number;
  /** Dinero de las barridas de compra, en $. */
  primaCompras: number;
  /** Dinero de las barridas de venta, en $. */
  primaVentas: number;
}

export const CODIGO_BARRIDA = "ISOI";

/** Día (YYYY-MM-DD) en Nueva York de un instante. */
export function diaNY(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function contarBarridas(filas: FilaFlujo[], c: ContratoBuscado, ahora: Date): Barridas {
  const hoy = diaNY(ahora);
  const r: Barridas = { compras: 0, ventas: 0, primaCompras: 0, primaVentas: 0 };
  for (const f of filas) {
    if (f.conditionCode !== CODIGO_BARRIDA) continue;
    if (f.type !== c.type || f.strike == null || Math.abs(f.strike - c.strike) > 1e-6) continue;
    if (c.expiration && f.expiration && f.expiration !== c.expiration) continue;
    const t = new Date(f.timestamp);
    if (Number.isNaN(t.getTime()) || diaNY(t) !== hoy) continue;
    if (f.aggression === "ask") { r.compras++; r.primaCompras += f.premium; }
    else if (f.aggression === "bid") { r.ventas++; r.primaVentas += f.premium; }
  }
  return r;
}

/**
 * La frase para el ticket. null si no hubo ninguna barrida: la ausencia no es
 * mala señal (muchos contratos buenos no tienen barridas), así que no se dice
 * nada en vez de asustar.
 */
export function fraseBarridas(b: Barridas | null): { texto: string; tono: "bien" | "mal" | "aviso" } | null {
  if (!b || b.compras + b.ventas === 0) return null;
  const n = (x: number, uno: string, varios: string) => `${x} ${x === 1 ? uno : varios}`;
  if (b.compras > 0 && b.ventas === 0) {
    return { texto: `✓ ${n(b.compras, "barrida comprando", "barridas comprando")} este contrato hoy`, tono: "bien" };
  }
  if (b.ventas > 0 && b.compras === 0) {
    return { texto: `✗ ${n(b.ventas, "barrida vendiendo", "barridas vendiendo")} este contrato hoy (apuestan en contra)`, tono: "mal" };
  }
  const manda = b.primaCompras >= b.primaVentas ? "más dinero comprando" : "más dinero vendiendo";
  return {
    texto: `${n(b.compras, "barrida", "barridas")} comprando y ${b.ventas} vendiendo este contrato hoy (${manda})`,
    tono: b.primaCompras >= b.primaVentas ? "bien" : "aviso",
  };
}
