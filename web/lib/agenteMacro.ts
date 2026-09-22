// ============================================================================
// Agente MACRO (MAC) — el rol que FinAnalista tiene en "Pronto":
//   › contexto de tasas y divisas · › mapear presión macro a sectores
//   › notas de régimen            · › evidencia con fecha
//
// Aquí se hace con lo que Nagimi puede bajar de verdad: cuatro ETFs que son el
// termómetro del ambiente, mirando su cambio de las últimas 20 sesiones.
//   SPY = el mercado · TLT = tasas (sube cuando las tasas bajan)
//   UUP = el dólar   · GLD = oro (sube cuando hay miedo o inflación)
//
// No es un modelo macro: es el ambiente en el que va a vivir tu trade, dicho
// con números fechados. Puro y testable.
// ============================================================================

export interface LecturaMacro {
  senal: string;
  tono: "up" | "down" | "neutral";
  viendo: string;
  empuje: string;
  /** Cambio de 20 sesiones por proxy, en %. null si faltó la serie. */
  cambios: Record<string, number | null>;
}

export const PROXIES: { ticker: string; que: string }[] = [
  { ticker: "SPY", que: "el mercado" },
  { ticker: "TLT", que: "las tasas" },
  { ticker: "UUP", que: "el dólar" },
  { ticker: "GLD", que: "el oro" },
];

/** Cambio % entre el último cierre y el de hace `sesiones`. */
export function cambioPct(cierres: number[], sesiones = 20): number | null {
  if (cierres.length < sesiones + 1) return null;
  const hoy = cierres[cierres.length - 1];
  const antes = cierres[cierres.length - 1 - sesiones];
  if (!(antes > 0)) return null;
  return ((hoy - antes) / antes) * 100;
}

const signo = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/**
 * El ambiente macro en una lectura. `series` es ticker → cierres diarios.
 * Devuelve null si ni siquiera se pudo leer el mercado (SPY).
 */
export function lecturaMacro(series: Record<string, number[]>, sesiones = 20): LecturaMacro | null {
  const cambios: Record<string, number | null> = {};
  for (const p of PROXIES) cambios[p.ticker] = cambioPct(series[p.ticker] ?? [], sesiones);

  const spy = cambios.SPY;
  if (spy == null) return null;

  const tlt = cambios.TLT;
  const uup = cambios.UUP;
  const gld = cambios.GLD;

  // Puntos: el mercado manda; el dólar fuerte resta; el oro disparado resta.
  let puntos = 0;
  if (spy > 1) puntos += 2; else if (spy < -1) puntos -= 2;
  if (tlt != null) { if (tlt > 1) puntos += 1; else if (tlt < -1) puntos -= 1; }
  if (uup != null) { if (uup > 1) puntos -= 1; else if (uup < -1) puntos += 1; }
  if (gld != null && gld > 5) puntos -= 1;

  const tono: LecturaMacro["tono"] = puntos >= 2 ? "up" : puntos <= -2 ? "down" : "neutral";
  const senal = puntos >= 2 ? "Viento a favor" : puntos <= -2 ? "Viento en contra" : "Ambiente mixto";

  const partes = PROXIES
    .map((p) => (cambios[p.ticker] == null ? null : `${p.ticker} ${signo(cambios[p.ticker]!)}`))
    .filter(Boolean);
  const viendo = `Últimas ${sesiones} sesiones: ${partes.join(" · ")}.`;

  const trozos: string[] = [];
  trozos.push(spy > 1
    ? "El mercado viene subiendo, así que las apuestas al alza reman a favor de la corriente."
    : spy < -1
      ? "El mercado viene cayendo: comprar calls es remar contra la corriente, aunque el ticker se vea bien."
      : "El mercado va de lado, así que el ambiente no ayuda ni estorba.");
  if (tlt != null) {
    trozos.push(tlt > 1
      ? "Los bonos suben (tasas bajando), que suele ser buena noticia para las acciones de crecimiento."
      : tlt < -1
        ? "Los bonos caen (tasas subiendo), y eso pesa sobre las acciones caras de crecimiento."
        : "Las tasas están quietas.");
  }
  if (uup != null && Math.abs(uup) > 1) {
    trozos.push(uup > 0
      ? "El dólar está fuerte, lo que quita aire a las empresas que venden fuera."
      : "El dólar está flojo, lo que ayuda a las empresas que venden fuera.");
  }
  if (gld != null && gld > 5) {
    trozos.push("El oro se disparó: hay gente buscando refugio, señal de nervios.");
  }
  trozos.push("Esto no cambia tu trade por sí solo, pero sí de qué lado sopla el viento.");

  return { senal, tono, viendo, empuje: trozos.join(" "), cambios };
}
