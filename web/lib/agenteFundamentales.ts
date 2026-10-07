// 📊 FND · Fundamentales — "¿es buena empresa, y está cara o barata?".
//
// El ROL PLANEADO de Aetheris para este agente es:
//   · connect filings and fundamentals  → métricas de Finnhub (salen de los 10-K/10-Q)
//   · separate facts from assumptions   → cada número dice si es REPORTADO o ESTIMADO
//   · publish valuation notes           → cara o barata CONTRA SUS COMPETIDORES
//   · track source quality              → fecha del último trimestre reportado
//
// Versión para opciones: no hace falta un modelo de valoración completo para un
// contrato de días o semanas. Lo que sirve es saber si la empresa crece, si
// gana dinero, si debe mucho y si el precio ya está estirado contra sus pares.
// Puro y con pruebas; la ruta /api/fundamentales junta los datos.

export interface Metricas {
  ticker: string;
  /** Precio ÷ ventas de los últimos 12 meses (reportado). */
  psTTM: number | null;
  /** Precio ÷ ganancia de los últimos 12 meses (reportado; null si perdió dinero). */
  peTTM: number | null;
  /** Precio ÷ ganancia que estiman los analistas para el año que viene (ESTIMADO). */
  forwardPE: number | null;
  /** Crecimiento de ventas, último año contra el anterior, en %. */
  crecVentasAnual: number | null;
  /** Crecimiento de ventas, último trimestre contra el mismo del año pasado, en %. */
  crecVentasTrimestre: number | null;
  /** De cada $100 que vende, cuánto le queda tras pagar la operación (%). */
  margenOperativo: number | null;
  /** De cada $100 que vende, cuánto le queda al final (%). */
  margenNeto: number | null;
  /** Deuda total ÷ lo que es de los accionistas. */
  deudaPatrimonio: number | null;
  /** Lo que tiene para pagar este año ÷ lo que debe pagar este año. */
  liquidezCorriente: number | null;
  /** Fecha del último trimestre reportado (YYYY-MM-DD). */
  trimestre: string | null;
}

/** Mediana de los valores que existen. null si no hay ninguno. */
export function mediana(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Saca las métricas que usamos de la respuesta de Finnhub `stock/metric?metric=all`. */
export function metricasDeFinnhub(ticker: string, j: {
  metric?: Record<string, number | null | undefined>;
  series?: { quarterly?: Record<string, { period: string; v: number }[]> };
} | null): Metricas | null {
  const m = j?.metric;
  if (!m) return null;
  const n = (k: string) => {
    const v = m[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const pe = n("peTTM") ?? n("peExclExtraTTM");
  const trimestre = j?.series?.quarterly?.eps?.[0]?.period ?? j?.series?.quarterly?.salesPerShare?.[0]?.period ?? null;
  return {
    ticker,
    psTTM: n("psTTM"),
    peTTM: pe != null && pe > 0 ? pe : null,
    forwardPE: (() => { const f = n("forwardPE"); return f != null && f > 0 ? f : null; })(),
    crecVentasAnual: n("revenueGrowthTTMYoy"),
    crecVentasTrimestre: n("revenueGrowthQuarterlyYoy"),
    margenOperativo: n("operatingMarginTTM"),
    margenNeto: n("netProfitMarginTTM"),
    deudaPatrimonio: n("totalDebt/totalEquityQuarterly") ?? n("totalDebt/totalEquityAnnual"),
    liquidezCorriente: n("currentRatioQuarterly") ?? n("currentRatioAnnual"),
    trimestre,
  };
}

export interface Pares {
  tickers: string[];
  psTTM: number | null;
  forwardPE: number | null;
  crecVentasAnual: number | null;
  margenOperativo: number | null;
}

export function medianaPares(pares: Metricas[]): Pares {
  return {
    tickers: pares.map((p) => p.ticker),
    psTTM: mediana(pares.map((p) => p.psTTM)),
    forwardPE: mediana(pares.map((p) => p.forwardPE)),
    crecVentasAnual: mediana(pares.map((p) => p.crecVentasAnual)),
    margenOperativo: mediana(pares.map((p) => p.margenOperativo)),
  };
}

export interface LecturaFundamentales {
  senal: string;
  tono: "up" | "down" | "neutral";
  viendo: string;
  empuje: string;
  detalles: string[];
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const veces = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 1 });

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("es-PR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "más cara" / "más barata" / "parecida" contra la mediana de los pares (±25%). */
export function comparaPrecio(propio: number | null, pares: number | null): "cara" | "barata" | "parecida" | null {
  if (propio == null || pares == null || !(pares > 0)) return null;
  const r = propio / pares;
  return r >= 1.25 ? "cara" : r <= 0.8 ? "barata" : "parecida";
}

export function lecturaFundamentales(m: Metricas, p: Pares | null): LecturaFundamentales {
  const detalles: string[] = [];
  let puntos = 0;
  const reportado = m.trimestre ? `reportado hasta el trimestre del ${fechaCorta(m.trimestre)}` : "reportado";

  // 1) ¿Crece?
  if (m.crecVentasAnual != null) {
    if (m.crecVentasAnual >= 10) puntos += 1;
    if (m.crecVentasAnual < 0) puntos -= 1;
    const vsPares = p?.crecVentasAnual != null
      ? ` Sus competidores crecieron ${pct(p.crecVentasAnual)} (la mitad del grupo).`
      : "";
    detalles.push(`Crecimiento (${reportado}): las ventas ${m.crecVentasAnual >= 0 ? "subieron" : "bajaron"} ${pct(m.crecVentasAnual)} en el último año`
      + (m.crecVentasTrimestre != null ? ` y ${pct(m.crecVentasTrimestre)} en el último trimestre contra el mismo del año pasado.` : ".")
      + vsPares);
  }

  // 2) ¿Gana dinero?
  if (m.margenNeto != null) {
    if (m.margenNeto < 0) puntos -= 1;
    else if (m.margenNeto >= 15) puntos += 1;
    detalles.push(m.margenNeto < 0
      ? `Ganancia (reportado): en el último año PERDIÓ dinero — por cada $100 que vendió, perdió $${Math.abs(m.margenNeto).toFixed(0)} al final.`
        + (m.margenOperativo != null && m.margenOperativo > 0 ? ` Ojo: su negocio principal sí deja $${m.margenOperativo.toFixed(0)} de cada $100; la pérdida viene de otros gastos o cargos.` : "")
      : `Ganancia (reportado): de cada $100 que vende, le quedan $${m.margenNeto.toFixed(0)} al final`
        + (m.margenOperativo != null ? ` ($${m.margenOperativo.toFixed(0)} después de pagar la operación).` : ".")
        + (p?.margenOperativo != null
          ? p.margenOperativo >= 0
            ? ` Sus competidores: $${p.margenOperativo.toFixed(0)} después de la operación.`
            : ` Sus competidores pierden $${Math.abs(p.margenOperativo).toFixed(0)} después de la operación.`
          : ""));
  }

  // 3) ¿Debe mucho?
  if (m.deudaPatrimonio != null) {
    const d = m.deudaPatrimonio;
    if (d > 1.5) puntos -= 1;
    detalles.push(`Deuda (reportado): debe $${d.toFixed(2)} por cada $1 que es de sus dueños — `
      + (d < 0.5 ? "poca deuda." : d <= 1.5 ? "deuda normal." : "mucha deuda: si suben las tasas o bajan las ventas, le pega más.")
      + (m.liquidezCorriente != null
        ? m.liquidezCorriente >= 1
          ? ` Tiene $${m.liquidezCorriente.toFixed(1)} por cada $1 que tiene que pagar este año.`
          : ` ⚠ Tiene solo $${m.liquidezCorriente.toFixed(2)} por cada $1 que tiene que pagar este año.`
        : ""));
  }

  // 4) ¿Cara o barata contra sus competidores?
  const porVentas = comparaPrecio(m.psTTM, p?.psTTM ?? null);
  if (m.psTTM != null) {
    if (porVentas === "cara") puntos -= 1;
    if (porVentas === "barata") puntos += 1;
    detalles.push(`Precio contra ventas (reportado): pagas $${veces(m.psTTM)} por cada $1 que vende al año`
      + (p?.psTTM != null ? `; en sus competidores pagas $${veces(p.psTTM)}. ` : ". ")
      + (porVentas === "cara" ? "Está más cara que su grupo."
        : porVentas === "barata" ? "Está más barata que su grupo."
          : porVentas === "parecida" ? "Está parecida a su grupo." : ""));
  }
  if (m.forwardPE != null) {
    const vsGrupo = comparaPrecio(m.forwardPE, p?.forwardPE ?? null);
    detalles.push(`Precio contra ganancia futura (ESTIMADO por analistas, no un hecho): pagas $${veces(m.forwardPE)} por cada $1 que se espera que gane el año que viene`
      + (p?.forwardPE != null ? `; en sus competidores, $${veces(p.forwardPE)}.` : ".")
      + (vsGrupo === "cara" ? " Más cara que su grupo." : vsGrupo === "barata" ? " Más barata que su grupo." : ""));
  }

  if (p && p.tickers.length > 0) {
    detalles.push(`Competidores comparados: ${p.tickers.join(", ")}. Los escoge Finnhub por industria y a veces no son los de verdad: si ves alguno raro, toma la comparación con cuidado.`);
  }

  const perdio = m.margenNeto != null && m.margenNeto < 0;

  // La calidad (crece, gana, debe) y el precio se juzgan por separado: una
  // empresa puede ser muy buena y estar cara, o floja y barata.
  const calidad = (m.crecVentasAnual == null ? 0 : m.crecVentasAnual >= 10 ? 1 : m.crecVentasAnual < 0 ? -1 : 0)
    + (m.margenNeto == null ? 0 : m.margenNeto >= 15 ? 1 : m.margenNeto < 0 ? -1 : 0)
    + (m.deudaPatrimonio != null && m.deudaPatrimonio > 1.5 ? -1 : 0);
  const porGanancia = comparaPrecio(m.forwardPE, p?.forwardPE ?? null);
  const chocan = porVentas && porGanancia && porVentas !== "parecida" && porGanancia !== "parecida" && porVentas !== porGanancia;
  const precio: "cara" | "barata" | "mixto" | null = chocan ? "mixto"
    : porVentas && porVentas !== "parecida" ? porVentas
      : porGanancia && porGanancia !== "parecida" ? porGanancia : null;

  const tonoPuntos = calidad + (precio === "barata" ? 1 : precio === "cara" ? -1 : 0);
  void puntos;
  const tono: LecturaFundamentales["tono"] = tonoPuntos >= 2 ? "up" : tonoPuntos <= -2 ? "down" : "neutral";
  const solida = calidad >= 2, floja = calidad <= -1;
  const senal = solida
    ? precio === "cara" ? "Sólida, pero cara" : precio === "barata" ? "Sólida y barata" : "Empresa sólida"
    : floja
      ? precio === "cara" ? "Floja y cara" : precio === "barata" ? "Floja, aunque barata" : "Números flojos"
      : precio === "cara" ? "Cara contra su grupo" : precio === "barata" ? "Barata contra su grupo" : "Números mezclados";

  const viendo = [
    m.crecVentasAnual != null ? `ventas ${pct(m.crecVentasAnual)} en un año` : null,
    m.margenNeto != null ? (perdio ? "perdiendo dinero" : `gana $${m.margenNeto.toFixed(0)} de cada $100`) : null,
    precio === "mixto"
      ? `más ${porVentas} por ventas pero más ${porGanancia} por ganancia futura que sus competidores`
      : precio ? `más ${precio} que sus competidores` : porVentas === "parecida" ? "precio parecido a sus competidores" : null,
  ].filter(Boolean).join(", ");

  const empuje = "Esto pesa a mediano plazo (semanas o meses), no en un contrato que se acaba hoy. "
    + (tono === "down"
      ? "Si vas a apostar a que sube por varias semanas, los números no te ayudan."
      : tono === "up"
        ? "Si vas a apostar a que sube por varias semanas, los números te respaldan."
        : "Los números no empujan para ningún lado claro.");

  return {
    senal, tono,
    viendo: viendo ? `${viendo[0].toUpperCase()}${viendo.slice(1)}.` : "Sin números suficientes.",
    empuje, detalles,
  };
}
