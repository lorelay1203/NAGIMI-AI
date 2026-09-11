// ============================================================================
// Saldo REAL disponible en los brokers conectados (Tastytrade y Schwab/TOS).
//
// Sirve para dejar de razonar en porcentajes: con una cuenta de $45 un "1% por
// operación" son 45 centavos, que no compra nada. Lo útil es saber cuánto dinero
// hay de verdad y qué cabe con eso.
//
// Solo LECTURA. Si un broker necesita reconectarse se dice — nunca se cuenta
// como $0, porque eso haría creer que no hay dinero cuando sí lo hay.
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { getAccounts as tastyAccounts } from "./tastytrade";
import { getAccounts as schwabAccounts } from "./schwab";

export type BrokerId = "tastytrade" | "schwab" | "robinhood" | "webull";

export interface CuentaSaldo {
  broker: BrokerId;
  brokerNombre: string;
  cuenta: string;
  /** Dinero utilizable para comprar opciones, en dólares. */
  disponible: number;
  /** Robinhood no tiene API pública: su saldo es una FOTO, no tiempo real. */
  foto?: boolean;
  /** Cuándo se tomó la foto (ISO). Solo en cuentas `foto`. */
  actualizado?: string;
}

export interface Problema {
  broker: BrokerId;
  brokerNombre: string;
  motivo: string;
}

export interface Saldos {
  cuentas: CuentaSaldo[];
  /** Suma de lo disponible en todas las cuentas que sí respondieron. */
  total: number;
  /** Brokers que no se pudieron leer (caducados, sin conectar…). */
  problemas: Problema[];
  /** true si al menos un broker respondió. */
  hayDatos: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Tastytrade: `derivative-buying-power` es lo que se puede usar para opciones.
 * Si no viene, se cae a la caja disponible.
 */
function tastySaldo(balance: unknown): number {
  const d = (balance as { data?: Record<string, unknown> } | null)?.data;
  if (!d) return 0;
  const cands = [d["derivative-buying-power"], d["cash-available-to-withdraw"], d["cash-balance"]];
  for (const c of cands) {
    const v = num(c);
    if (v > 0) return v;
  }
  return 0;
}

/**
 * Brókers sin API pública (Robinhood, Webull): no se pueden conectar solos,
 * así que su saldo vive en una FOTO en disco que se actualiza a mano. Si el
 * archivo no está, ese bróker simplemente no aparece — no es un "problema de
 * conexión", es que aún no se ha tomado la foto.
 *
 * - Robinhood: Claude lo lee en vivo por su conector y reescribe la foto.
 * - Webull: no hay conector; el número lo pone Lorelay (o Claude cuando ella
 *   lo dice). Es su cuenta reto — empezó con $10.75.
 */
interface BrokerFoto {
  obtenidoEn?: string;
  cuentas?: { cuenta?: string; disponible?: number }[];
}
const FOTOS: { broker: Exclude<BrokerId, "tastytrade" | "schwab">; brokerNombre: string; file: string }[] = [
  { broker: "robinhood", brokerNombre: "Robinhood", file: "robinhood_snapshot.json" },
  { broker: "webull", brokerNombre: "Webull", file: "webull_snapshot.json" },
];

async function leerFotos(): Promise<CuentaSaldo[]> {
  const out: CuentaSaldo[] = [];
  for (const f of FOTOS) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(process.cwd(), "data", f.file), "utf8");
    } catch {
      continue; // sin foto → ese bróker no se muestra, sin alarma
    }
    let foto: BrokerFoto;
    try {
      foto = JSON.parse(raw) as BrokerFoto;
    } catch {
      continue;
    }
    for (const c of foto.cuentas ?? []) {
      const disponible = num(c.disponible);
      if (disponible > 0) {
        out.push({
          broker: f.broker,
          brokerNombre: f.brokerNombre,
          cuenta: String(c.cuenta ?? "—"),
          disponible,
          foto: true,
          actualizado: foto.obtenidoEn,
        });
      }
    }
  }
  return out;
}

/** Schwab/TOS: efectivo disponible para operar de `currentBalances`. */
function schwabSaldo(acc: unknown): { cuenta: string; disponible: number } | null {
  const sa = (acc as { securitiesAccount?: Record<string, unknown> })?.securitiesAccount;
  if (!sa) return null;
  const cb = (sa.currentBalances ?? {}) as Record<string, unknown>;
  const cands = [cb.cashAvailableForTrading, cb.availableFunds, cb.buyingPower, cb.cashBalance];
  let disponible = 0;
  for (const c of cands) {
    const v = num(c);
    if (v > 0) { disponible = v; break; }
  }
  return { cuenta: String(sa.accountNumber ?? "—"), disponible };
}

/** Lee las dos cuentas en paralelo. Nunca lanza: los fallos se reportan. */
export async function getSaldos(): Promise<Saldos> {
  const cuentas: CuentaSaldo[] = [];
  const problemas: Problema[] = [];
  let respondio = false;

  const [tt, sw, rh] = await Promise.allSettled([
    tastyAccounts(),
    schwabAccounts(),
    leerFotos(),
  ]);

  if (tt.status === "fulfilled") {
    respondio = true;
    for (const a of tt.value.accounts ?? []) {
      cuentas.push({
        broker: "tastytrade", brokerNombre: "Tastytrade",
        cuenta: a.nickname || a.accountNumber,
        disponible: tastySaldo(a.balance),
      });
    }
  } else {
    problemas.push({
      broker: "tastytrade", brokerNombre: "Tastytrade",
      motivo: mensaje(tt.reason, "Reconéctalo en la app."),
    });
  }

  if (sw.status === "fulfilled") {
    respondio = true;
    const raw = sw.value as { accounts?: unknown[] } | unknown[];
    const list = Array.isArray(raw) ? raw : (raw?.accounts ?? []);
    for (const a of list) {
      const s = schwabSaldo(a);
      if (s) cuentas.push({ broker: "schwab", brokerNombre: "Schwab (TOS)", cuenta: s.cuenta, disponible: s.disponible });
    }
  } else {
    problemas.push({
      broker: "schwab", brokerNombre: "Schwab (TOS)",
      motivo: mensaje(sw.reason, "Vuelve a conectarlo en /schwab."),
    });
  }

  // Fotos en disco (Robinhood, Webull); si hay, se suman como cuentas más.
  // Nunca generan "problema": su ausencia solo significa que no hay foto aún.
  if (rh.status === "fulfilled" && rh.value.length > 0) {
    respondio = true;
    cuentas.push(...rh.value);
  }

  cuentas.sort((a, b) => b.disponible - a.disponible);
  return {
    cuentas,
    total: cuentas.reduce((s, c) => s + c.disponible, 0),
    problemas,
    hayDatos: respondio,
  };
}

function mensaje(err: unknown, sugerencia: string): string {
  const base = err instanceof Error ? err.message : String(err ?? "");
  return `${base.slice(0, 120)} ${sugerencia}`.trim();
}

export interface Encaje {
  /** Cuentas donde SÍ alcanza el dinero, de mayor a menor saldo. */
  cuentasQuePueden: CuentaSaldo[];
  /** Cuántos contratos caben en la mejor cuenta. */
  contratosPosibles: number;
  cabe: boolean;
  /** Frase lista para mostrar. */
  resumen: string;
}

/**
 * ¿Con cuánto dinero real se puede ejecutar algo que cuesta `costoPorContrato`?
 * Responde en cuentas y contratos, no en porcentajes.
 */
export function encajeEnCuentas(costoPorContrato: number, saldos: Saldos): Encaje {
  if (!(costoPorContrato > 0)) {
    return { cuentasQuePueden: [], contratosPosibles: 0, cabe: false, resumen: "Sin coste calculado." };
  }
  const pueden = saldos.cuentas.filter((c) => c.disponible >= costoPorContrato);
  const mejor = pueden[0];
  const contratos = mejor ? Math.floor(mejor.disponible / costoPorContrato) : 0;

  if (!saldos.hayDatos) {
    return { cuentasQuePueden: [], contratosPosibles: 0, cabe: false,
      resumen: "No pude leer tus cuentas, así que no sé si te alcanza." };
  }
  if (!mejor) {
    const masAlto = saldos.cuentas[0];
    const falta = masAlto ? costoPorContrato - masAlto.disponible : costoPorContrato;
    return { cuentasQuePueden: [], contratosPosibles: 0, cabe: false,
      resumen: `No te alcanza: cuesta $${costoPorContrato.toFixed(0)} y tu mejor cuenta tiene $${(masAlto?.disponible ?? 0).toFixed(0)} (faltan $${falta.toFixed(0)}).` };
  }
  return {
    cuentasQuePueden: pueden, contratosPosibles: contratos, cabe: true,
    resumen: `Te alcanza en ${mejor.brokerNombre} (${mejor.cuenta}): $${mejor.disponible.toFixed(0)} disponibles, `
      + `caben ${contratos} contrato${contratos === 1 ? "" : "s"} de $${costoPorContrato.toFixed(0)}.`,
  };
}
