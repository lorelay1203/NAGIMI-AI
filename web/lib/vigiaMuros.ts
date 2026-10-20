// ============================================================================
// Vigía de muros: decide cuándo avisarle a la usuaria que los muros de GEX
// cambiaron, para que vuelva a pegar la "Línea de Nagimi" en TradingView.
//
// TradingView no puede leer a Nagimi por sí solo (y Pine Seeds, el camino
// automático, no acepta repositorios nuevos), así que la línea es una foto.
// El vigía la compara cada pocos minutos y avisa al celular solo cuando algo
// que importa se movió. PURO: las fotos entran como datos.
// ============================================================================

export interface FotoMuros {
  ticker: string;
  fecha: string;          // YYYY-MM-DD Nueva York
  spot: number;
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  gammaFlip: number | null;
  regime: "positive" | "negative";
  linea: string;
}

/** Un muro o el imán "se movió" si cambia más de esto (0.05% del precio ≈ un strike de SPY). */
export const TOL_MURO = 0.0005;
/** El flip se calcula continuo y baila más: solo cuenta si se mueve más de 0.2%. */
export const TOL_FLIP = 0.002;

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function cambio(nombre: string, a: number | null, b: number | null, tol: number, spot: number): string | null {
  if (a == null && b == null) return null;
  if (a == null || b == null) return `${nombre}: ${a == null ? "apareció" : "desapareció"}${b != null ? ` en ${fmt(b)}` : ""}`;
  if (Math.abs(a - b) < spot * tol) return null;
  return `${nombre}: ${fmt(a)} → ${fmt(b)}`;
}

/**
 * Qué cambió entre la foto anterior y la de ahora, en palabras.
 * Lista vacía = nada que valga un aviso.
 */
export function cambiosMuros(antes: FotoMuros | null, ahora: FotoMuros): string[] {
  if (!antes || antes.fecha !== ahora.fecha) return ["primera foto del día"];
  const spot = ahora.spot > 0 ? ahora.spot : antes.spot;
  const out: string[] = [];
  const c1 = cambio("Call wall", antes.callWall, ahora.callWall, TOL_MURO, spot);
  const c2 = cambio("Put wall", antes.putWall, ahora.putWall, TOL_MURO, spot);
  const c3 = cambio("Imán", antes.magnet, ahora.magnet, TOL_MURO, spot);
  const c4 = cambio("Flip", antes.gammaFlip, ahora.gammaFlip, TOL_FLIP, spot);
  for (const c of [c1, c2, c3, c4]) if (c) out.push(c);
  if (antes.regime !== ahora.regime) {
    out.push(`Tipo de día: ${antes.regime === "positive" ? "rango" : "empujón"} → ${ahora.regime === "positive" ? "RANGO" : "EMPUJÓN"}`);
  }
  return out;
}

/** ¿Hay mercado ahora? Lunes a viernes, 9:30 AM – 4:00 PM de Nueva York. */
export function enHorarioMercado(d: Date): boolean {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const dia = p.find((x) => x.type === "weekday")?.value ?? "";
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  const min = h * 60 + m;
  return !["Sat", "Sun"].includes(dia) && min >= 570 && min < 960;
}

export interface Aviso {
  titulo: string;
  mensaje: string;
}

/** El texto del aviso al celular. La línea va al final para poder copiarla. */
export function armarAviso(ahora: FotoMuros, cambios: string[]): Aviso {
  const tipo = ahora.regime === "positive" ? "día de rango" : "día de empujón";
  const primera = cambios.length === 1 && cambios[0] === "primera foto del día";
  const titulo = primera
    ? `Muros de hoy · ${ahora.ticker}`
    : `Cambiaron los muros de ${ahora.ticker}`;
  const cuerpo = primera
    ? `${tipo}. CW ${ahora.callWall != null ? fmt(ahora.callWall) : "—"} · Imán ${ahora.magnet != null ? fmt(ahora.magnet) : "—"} · PW ${ahora.putWall != null ? fmt(ahora.putWall) : "—"}`
    : cambios.join("\n");
  return {
    titulo,
    mensaje: `${cuerpo}\n\nPega esta línea en TradingView (Ajustes → Línea de Nagimi):\n${ahora.linea}`,
  };
}

/** Nombre de canal difícil de adivinar para ntfy (quien lo sepa puede leer los avisos). */
export function temaAleatorio(rnd: () => number = Math.random): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 18; i++) s += abc[Math.floor(rnd() * abc.length)];
  return `nagimi-${s}`;
}
