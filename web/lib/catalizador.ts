// ============================================================================
// Agente de Catalizadores (CAT) — el próximo earnings y qué significa para
// opciones. Es la dimensión que Nagimi no tenía: no basta la dirección, hay
// que saber si hay un reporte cerca, porque después del earnings la IV se
// desinfla ("IV crush") y tu opción pierde valor AUNQUE aciertes.
//
// Puro y testable: la fecha entra como dato (de Finnhub), aquí solo se traduce.
// ============================================================================

export interface Catalizador {
  fecha: string;              // YYYY-MM-DD del próximo reporte
  hora: string | null;       // "bmo" | "amc" | "dmh" | null
  epsEstimate: number | null;
  diasFaltan: number;
  /** Riesgo por cercanía: "inminente" (<=5d), "cerca" (<=15d), "lejos". */
  nivel: "inminente" | "cerca" | "lejos";
  senal: string;             // etiqueta corta para la tarjeta
  tono: "up" | "down" | "neutral";
  /** Qué está viendo, en llano. */
  viendo: string;
  /** El aviso completo con el porqué (IV crush). */
  aviso: string;
}

function diasEntre(desde: Date, hastaISO: string): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(hastaISO);
  if (!m) return NaN;
  const b = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((b - a) / 86_400_000);
}

const horaTxt = (h: string | null): string =>
  h === "bmo" ? "antes de abrir" : h === "amc" ? "después del cierre" : h === "dmh" ? "durante el día" : "";

/**
 * Traduce el próximo earnings a lectura de catalizador. Devuelve null si no hay
 * fecha (ETF/índice que no reporta, o dato no disponible) o si ya pasó.
 */
export function buildCatalizador(
  earnings: { date: string; hour: string | null; epsEstimate: number | null } | null,
  now: Date = new Date(),
): Catalizador | null {
  if (!earnings?.date) return null;
  const dias = diasEntre(now, earnings.date);
  if (!Number.isFinite(dias) || dias < 0) return null;

  const nivel = dias <= 5 ? "inminente" : dias <= 15 ? "cerca" : "lejos";
  const cuando = horaTxt(earnings.hour);
  const epsTxt = earnings.epsEstimate != null ? ` (EPS estimado $${earnings.epsEstimate.toFixed(2)})` : "";

  const senal = nivel === "inminente" ? `Reporta en ${dias}d ⚠`
    : nivel === "cerca" ? `Reporta en ${dias}d`
    : `Reporta en ${dias}d`;
  const tono: Catalizador["tono"] = nivel === "lejos" ? "neutral" : "down"; // cercano = precaución

  const viendo = `Próximo reporte: ${earnings.date}${cuando ? ` (${cuando})` : ""}${epsTxt}.`;

  let aviso: string;
  if (nivel === "inminente") {
    aviso = `El reporte es en ${dias} día${dias === 1 ? "" : "s"}. Antes de earnings la IV sube y las `
      + `opciones están CARAS; justo después se desinfla de golpe (IV crush) y pierden valor aunque `
      + `aciertes la dirección. Si compras prima ahora, estás pagando caro. Muchos prefieren esperar a `
      + `que reporte y comprar después, más barato.`;
  } else if (nivel === "cerca") {
    aviso = `El reporte es en ${dias} días. Ya empieza a inflar la IV. Si tu opción vence DESPUÉS del `
      + `reporte, ojo con el IV crush; si vence antes, no te afecta directo pero el mercado se pone nervioso.`;
  } else {
    aviso = `El próximo reporte es en ${dias} días — lejos. No hay riesgo de IV crush a corto plazo; `
      + `puedes operar sin ese peso encima.`;
  }

  return {
    fecha: earnings.date,
    hora: earnings.hour,
    epsEstimate: earnings.epsEstimate,
    diasFaltan: dias,
    nivel,
    senal,
    tono,
    viendo,
    aviso,
  };
}
