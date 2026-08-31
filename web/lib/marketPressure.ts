/**
 * Presión del mercado: lee el flujo completo de un ticker como lo muestra
 * MarketSnack (premium por lado del libro Bid/Mid/Ask + reparto Calls/Puts) y
 * lo traduce a lenguaje simple.
 *
 * La clave es CRUZAR lado × tipo, no mirar los dos porcentajes por separado:
 * un 70% en calls no es alcista si ese premium se ejecutó al bid (se vendieron).
 *
 *   comprar calls (ask) → alcista      vender calls (bid) → bajista/cobertura
 *   comprar puts  (ask) → bajista      vender puts  (bid) → alcista (piso)
 */
import type { FlowRow } from "./flow";

export interface SideSplit { bid: number; mid: number; ask: number; total: number }
export interface TypeSplit { calls: number; puts: number; total: number }

export interface CrossTab {
  callsBought: number; // calls al ask  → alcista
  callsSold: number;   // calls al bid  → bajista / cobertura
  putsBought: number;  // puts al ask   → bajista
  putsSold: number;    // puts al bid   → alcista (soporte)
}

export interface MarketPressure {
  side: SideSplit;
  type: TypeSplit;
  cross: CrossTab;
  /** % del premium direccional que apunta arriba (0-100). null si no hay datos. */
  bullishPct: number | null;
  bias: "alcista" | "bajista" | "neutral";
  /** Titular corto, p.ej. "Venta de calls — cautela". */
  headline: string;
  /** Qué significa, en simple. */
  meaning: string;
  /** Qué podrías hacer tú. */
  whatYouCanDo: string;
  /** Avisos honestos (poco premium, mucho mid, etc.). */
  caveats: string[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0);

export function analyzeMarketPressure(rows: FlowRow[]): MarketPressure {
  const side: SideSplit = { bid: 0, mid: 0, ask: 0, total: 0 };
  const type: TypeSplit = { calls: 0, puts: 0, total: 0 };
  const cross: CrossTab = { callsBought: 0, callsSold: 0, putsBought: 0, putsSold: 0 };

  for (const r of rows) {
    const p = r.premium || 0;
    if (p <= 0) continue;
    side.total += p;
    if (r.aggression === "ask") side.ask += p;
    else if (r.aggression === "bid") side.bid += p;
    else side.mid += p; // "mid" y "unknown" se agrupan: no fueron agresivos

    if (r.type === "call") { type.calls += p; type.total += p; }
    else if (r.type === "put") { type.puts += p; type.total += p; }

    if (r.type === "call" && r.aggression === "ask") cross.callsBought += p;
    else if (r.type === "call" && r.aggression === "bid") cross.callsSold += p;
    else if (r.type === "put" && r.aggression === "ask") cross.putsBought += p;
    else if (r.type === "put" && r.aggression === "bid") cross.putsSold += p;
  }

  // Solo cuenta el premium con dirección clara (el ejecutado en el medio no opina).
  const bull = cross.callsBought + cross.putsSold;
  const bear = cross.callsSold + cross.putsBought;
  const directional = bull + bear;
  const bullishPct = directional > 0 ? Math.round(pct(bull, directional)) : null;

  const bias: MarketPressure["bias"] =
    bullishPct === null ? "neutral"
    : bullishPct >= 60 ? "alcista"
    : bullishPct <= 40 ? "bajista"
    : "neutral";

  const { headline, meaning } = describe(cross, bias, bullishPct);
  const whatYouCanDo =
    bias === "alcista"
      ? "Si buscas seguir esa dirección con cuenta chica: un CALL barato o un CALL DEBIT SPREAD (riesgo topado). Espera confirmación del precio antes de entrar."
      : bias === "bajista"
      ? "Si buscas seguir esa dirección con cuenta chica: un PUT barato o un PUT DEBIT SPREAD (riesgo topado). Espera confirmación del precio antes de entrar."
      : "No hay dirección clara: hoy no es día de forzar una entrada. Mejor observa y espera que el flujo se decante.";

  const caveats: string[] = [];
  if (side.total < 1e6) caveats.push("Poco premium total: la lectura es débil, no la tomes como señal.");
  if (pct(side.mid, side.total) >= 40) caveats.push("Mucho premium se ejecutó en el medio (ni compra ni venta agresiva): dirección poco fiable.");
  if (directional > 0 && Math.abs(50 - (bullishPct ?? 50)) < 10) caveats.push("Compradores y vendedores están casi empatados.");
  caveats.push("Vender calls a veces es cobertura de alguien que ya tiene la acción, no una apuesta bajista pura.");

  return { side, type, cross, bullishPct, bias, headline, meaning, whatYouCanDo, caveats };
}

function describe(c: CrossTab, bias: MarketPressure["bias"], bullishPct: number | null): { headline: string; meaning: string } {
  if (bullishPct === null)
    return { headline: "Sin dirección", meaning: "No hubo premium con dirección clara: casi todo se ejecutó en el medio del bid/ask, así que no se sabe quién manda." };

  // ¿Cuál de las cuatro combinaciones movió más dinero?
  const entries: Array<[keyof CrossTab, number]> = [
    ["callsBought", c.callsBought], ["callsSold", c.callsSold],
    ["putsBought", c.putsBought], ["putsSold", c.putsSold],
  ];
  const [top] = entries.sort((a, b) => b[1] - a[1]);
  const dominant = top[0];

  const byDominant: Record<keyof CrossTab, { headline: string; meaning: string }> = {
    callsBought: {
      headline: "Compra de calls — apuesta alcista",
      meaning: "La mayor parte del dinero fue gente PAGANDO por comprar calls: apuestan a que sube, y pagaron por entrar ya. Es la señal alcista más limpia.",
    },
    callsSold: {
      headline: "Venta de calls — cautela",
      meaning: "La mayor parte del dinero fue gente VENDIENDO calls: apuestan a que NO sube más de cierto precio, o están cobrando prima / cerrando posiciones que ya ganaron. Suele frenar la subida.",
    },
    putsBought: {
      headline: "Compra de puts — miedo o cobertura",
      meaning: "La mayor parte del dinero fue gente PAGANDO por comprar puts: apuestan a que baja, o se están protegiendo. Presión hacia abajo.",
    },
    putsSold: {
      headline: "Venta de puts — confianza en el piso",
      meaning: "La mayor parte del dinero fue gente VENDIENDO puts: apuestan a que NO baja de cierto precio. Suele marcar un soporte y es señal alcista.",
    },
  };

  const base = byDominant[dominant];
  const tail =
    bias === "neutral"
      ? " Aun así, el conjunto está repartido: no hay un ganador claro."
      : ` En total, ${bullishPct}% del dinero con dirección apunta hacia arriba.`;
  return { headline: base.headline, meaning: base.meaning + tail };
}
