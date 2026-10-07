// 🧭 MAC · Macro — la parte del SECTOR.
//
// El ROL PLANEADO de Aetheris para Macro incluye:
//   · map macro pressure to sectors  → ¿el sector del ticker va con o contra el mercado?
//   · show date-stamped evidence      → cada lectura dice hasta qué fecha llegan los datos
// El ambiente general (mercado, tasas, dólar, oro) ya lo hace lib/agenteMacro.ts;
// esto le suma el sector y cómo va el ticker dentro de su propio sector.

/** Industria de Finnhub (`finnhubIndustry`) → fondo del sector que la representa. */
const SECTORES: { claves: string[]; etf: string; nombre: string }[] = [
  { claves: ["semiconductor"], etf: "SMH", nombre: "semiconductores" },
  { claves: ["software", "technology", "it services", "electronic", "computers", "hardware"], etf: "XLK", nombre: "tecnología" },
  { claves: ["bank", "financial", "insurance", "capital markets", "diversified financial"], etf: "XLF", nombre: "bancos y finanzas" },
  { claves: ["energy", "oil", "gas", "coal"], etf: "XLE", nombre: "energía" },
  { claves: ["health", "pharma", "biotech", "life sciences", "medical"], etf: "XLV", nombre: "salud" },
  { claves: ["retail", "automobile", "auto ", "hotels", "restaurants", "leisure", "consumer products", "textiles", "apparel"], etf: "XLY", nombre: "consumo por gusto" },
  { claves: ["food", "beverage", "tobacco", "household"], etf: "XLP", nombre: "consumo básico" },
  { claves: ["media", "communication", "telecommunication", "entertainment"], etf: "XLC", nombre: "comunicaciones y medios" },
  { claves: ["utilities"], etf: "XLU", nombre: "servicios públicos" },
  { claves: ["real estate"], etf: "XLRE", nombre: "bienes raíces" },
  { claves: ["aerospace", "defense", "airlines", "machinery", "industrial", "logistics", "transportation", "construction", "building", "electrical equipment", "road & rail", "marine"], etf: "XLI", nombre: "industria" },
  { claves: ["chemical", "metals", "mining", "packaging", "paper"], etf: "XLB", nombre: "materiales" },
];

export interface Sector {
  etf: string;
  nombre: string;
  industria: string;
}

export function sectorDe(industria: string | null | undefined): Sector | null {
  const i = (industria ?? "").toLowerCase();
  if (!i) return null;
  for (const s of SECTORES) {
    if (s.claves.some((c) => i.includes(c))) return { etf: s.etf, nombre: s.nombre, industria: industria! };
  }
  return null;
}

/** Fondos e índices: no tienen sector, son el mercado (o una parte de él). */
const FONDOS = new Set(["SPY", "QQQ", "IWM", "DIA", "XSP", "SPX", "NDX", "RUT", "VIX"]);

export interface LecturaSector {
  /** Puntos que suma o resta al ambiente: + sector a favor, − en contra. */
  puntos: number;
  detalles: string[];
  /** Resumen corto para la línea principal. */
  resumen: string | null;
}

const signo = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("es-PR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * El sector contra el mercado, y el ticker contra su sector, en las mismas
 * sesiones. Un punto de diferencia o menos se considera "parejo".
 */
export function lecturaSector(i: {
  ticker: string;
  sector: Sector | null;
  sesiones: number;
  cambioTicker: number | null;
  cambioSector: number | null;
  cambioMercado: number | null;
  /** Último día con datos (YYYY-MM-DD). */
  fechaDatos: string | null;
}): LecturaSector {
  const detalles: string[] = [];
  let puntos = 0;
  let resumen: string | null = null;
  const { sector: s } = i;

  if (s && i.cambioSector != null && i.cambioMercado != null) {
    const dif = i.cambioSector - i.cambioMercado;
    if (dif >= 2) puntos += 1;
    if (dif <= -2) puntos -= 1;
    const como = Math.abs(dif) <= 1 ? "parejo con el mercado"
      : dif > 0 ? `${dif.toFixed(1)} puntos mejor que el mercado` : `${Math.abs(dif).toFixed(1)} puntos peor que el mercado`;
    detalles.push(`Sector de ${i.ticker}: ${s.nombre} (fondo ${s.etf}). En las últimas ${i.sesiones} sesiones se movió ${signo(i.cambioSector)}, `
      + `${como} (${signo(i.cambioMercado)}). `
      + (dif >= 2 ? "El dinero está entrando a este sector: viento a favor."
        : dif <= -2 ? "El dinero está saliendo de este sector: aunque el mercado suba, este grupo se queda atrás."
          : "El sector no tiene viento propio: va con el mercado."));
    resumen = dif >= 2 ? `su sector (${s.nombre}) va mejor que el mercado`
      : dif <= -2 ? `su sector (${s.nombre}) va peor que el mercado`
        : `su sector (${s.nombre}) va parejo con el mercado`;
  } else if (!s) {
    detalles.push(FONDOS.has(i.ticker)
      ? `${i.ticker} es un fondo del mercado completo, no de un sector: aquí manda el ambiente general.`
      : `No se pudo ubicar el sector de ${i.ticker}, así que solo se mira el mercado completo.`);
  }

  if (s && i.cambioTicker != null && i.cambioSector != null && i.ticker !== s.etf) {
    const dif = i.cambioTicker - i.cambioSector;
    detalles.push(Math.abs(dif) <= 1
      ? `${i.ticker} se mueve igual que su sector (${signo(i.cambioTicker)}).`
      : dif > 0
        ? `${i.ticker} va ${dif.toFixed(1)} puntos por delante de su propio sector (${signo(i.cambioTicker)}): es de los fuertes del grupo.`
        : `${i.ticker} va ${Math.abs(dif).toFixed(1)} puntos por detrás de su propio sector (${signo(i.cambioTicker)}): es de los flojos del grupo.`);
  }

  if (i.fechaDatos) detalles.push(`Datos hasta el cierre del ${fechaCorta(i.fechaDatos)}.`);

  return { puntos, detalles, resumen };
}
