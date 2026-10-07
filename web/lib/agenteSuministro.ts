// 🚚 SUP · Cadena de suministro — versión PARCIAL, y lo dice.
//
// El ROL PLANEADO de Aetheris para este agente es:
//   · map suppliers and customers   → el mapa real de proveedores NO está en el
//                                     plan (Finnhub supply-chain da 403). Lo que sí:
//                                     cuánto depende de sus clientes más grandes,
//                                     leído del reporte anual (10-K) en la SEC.
//   · watch logistics risk          → inventario contra ventas (XBRL de la SEC) y
//                                     avisos 8-K recientes que hablan de aranceles,
//                                     controles de exportación o escasez.
//   · flag concentration exposure   → la concentración de clientes.
//   · link source evidence          → cada cosa con su enlace a sec.gov.
// Puro y con pruebas; la ruta /api/suministro junta los datos.

// ---------------------------------------------------------------------------
// 1) Concentración de clientes (texto del 10-K)
// ---------------------------------------------------------------------------

export interface Concentracion {
  /** El % más alto que el reporte le atribuye a un cliente o grupo de clientes. */
  mayorPct: number | null;
  /** true si la frase habla de VARIOS clientes juntos ("our three largest customers"). */
  agrupado: boolean;
  /** Las frases tal como salen en el reporte (en inglés), sin repetir. Máximo 2. */
  frases: string[];
}

/** Quita etiquetas HTML y deja el texto plano en una línea. */
export function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#\d+;|&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");
}

const FRASE = /[^.]{0,220}?\b(\d{1,2}(?:\.\d)?)\s?%\s+of\s+(?:our\s+)?(?:total\s+)?(?:net\s+)?(?:revenue|sales|net sales)[^.]{0,120}\./gi;

export function concentracionClientes(texto: string): Concentracion {
  const frases: string[] = [];
  let mayorPct: number | null = null;
  let agrupado = false;
  for (const m of texto.matchAll(FRASE)) {
    let f = m[0].trim().replace(/^[^A-Za-z]+/, "");
    // Si arrastra el título de la sección ("Direct Customers For fiscal…"), se quita.
    const inicio = f.search(/\b(?:For|During|Collectively|Sales to|In fiscal|In 20\d\d)\b/);
    if (inicio > 0 && inicio <= 40) f = f.slice(inicio);
    if (!/customer|distributor/i.test(f)) continue;
    if (frases.some((x) => x.includes(f) || f.includes(x))) continue;
    // Solo la PRIMERA frase manda (es la del año más reciente); las demás, de apoyo.
    if (frases.length === 0) {
      const pcts = [...f.matchAll(/(\d{1,2}(?:\.\d)?)\s?%/g)].map((x) => Number(x[1]));
      // El primer % es el del año más reciente ("43% en 2025, 45% en 2024…").
      mayorPct = pcts.length ? pcts[0] : null;
      agrupado = /\b(two|three|four|five|largest customers|customers collectively|collectively)\b/i.test(f) && !/\bone\b/i.test(f.split(/[0-9]/)[0]);
    }
    frases.push(f);
    if (frases.length >= 2) break;
  }
  return { mayorPct, agrupado, frases };
}

// ---------------------------------------------------------------------------
// 2) Inventario contra ventas (XBRL)
// ---------------------------------------------------------------------------

export interface HechoXbrl {
  start?: string;
  end: string;
  val: number;
  form: string;
}

export interface InventarioVentas {
  /** Cambio del inventario contra hace un año, en %. */
  inventarioPct: number;
  /** Cambio de las ventas del último trimestre contra el mismo trimestre del año pasado, en %. */
  ventasPct: number;
  /** Fecha del último dato. */
  fecha: string;
}

const DIA = 86_400_000;
const dias = (a: string, b: string) => (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / DIA;

/** El valor de ~un año antes de `fin` (entre 330 y 400 días). */
function haceUnAno<T extends { end: string }>(lista: T[], fin: string): T | null {
  return lista.filter((h) => { const d = dias(h.end, fin); return d >= 330 && d <= 400; }).pop() ?? null;
}

export function inventarioVsVentas(inventario: HechoXbrl[], ventas: HechoXbrl[]): InventarioVentas | null {
  const inv = inventario.filter((h) => /^10-[KQ]/.test(h.form)).sort((a, b) => a.end.localeCompare(b.end));
  // Ventas de UN trimestre (≈ 3 meses), para comparar trimestre contra trimestre.
  const trim = ventas
    .filter((h) => /^10-[KQ]/.test(h.form) && h.start && dias(h.start, h.end) >= 80 && dias(h.start, h.end) <= 100)
    .sort((a, b) => a.end.localeCompare(b.end));
  const iAhora = inv.at(-1), vAhora = trim.at(-1);
  if (!iAhora || !vAhora) return null;
  const iAntes = haceUnAno(inv, iAhora.end), vAntes = haceUnAno(trim, vAhora.end);
  if (!iAntes || !vAntes || !(iAntes.val > 0) || !(vAntes.val > 0)) return null;
  return {
    inventarioPct: (iAhora.val / iAntes.val - 1) * 100,
    ventasPct: (vAhora.val / vAntes.val - 1) * 100,
    fecha: iAhora.end,
  };
}

// ---------------------------------------------------------------------------
// 3) La lectura completa
// ---------------------------------------------------------------------------

export interface LecturaSuministro {
  senal: string;
  tono: "up" | "down" | "neutral";
  viendo: string;
  empuje: string;
  detalles: string[];
  fuentes: { texto: string; url: string }[];
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("es-PR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function lecturaSuministro(i: {
  ticker: string;
  concentracion: Concentracion | null;
  reporteAnual: { fecha: string; url: string } | null;
  inventario: InventarioVentas | null;
  avisos: { fecha: string; url: string }[];
}): LecturaSuministro {
  const detalles: string[] = [];
  const fuentes: { texto: string; url: string }[] = [];
  let puntos = 0;

  // Clientes
  const c = i.concentracion;
  if (c && i.reporteAnual) {
    fuentes.push({ texto: `Reporte anual (10-K) del ${fechaCorta(i.reporteAnual.fecha)}`, url: i.reporteAnual.url });
    if (c.mayorPct != null) {
      if (c.mayorPct >= 30 || (!c.agrupado && c.mayorPct >= 20)) puntos -= 1;
      detalles.push(c.agrupado
        ? `Depende de pocos clientes: según su reporte anual, sus clientes más grandes juntos son el ${c.mayorPct}% de sus ventas.`
        : `Depende de pocos clientes: según su reporte anual, un solo cliente compró el ${c.mayorPct}% de todo lo que vendió.`);
      detalles.push(c.mayorPct >= 20
        ? c.agrupado
          ? "Si alguno de esos clientes compra menos o se va con la competencia, a la empresa le pega fuerte."
          : "Si ese cliente compra menos o se va con la competencia, a la empresa le pega fuerte."
        : "Es una dependencia moderada.");
      detalles.push(`Lo que dice el reporte (en inglés): "${c.frases[0]}"`);
    } else {
      detalles.push("No reporta ningún cliente que pese 10% o más de sus ventas (las empresas solo tienen que decirlo cuando pasa del 10%): no depende de un cliente en particular.");
    }
  } else {
    detalles.push("No se pudo leer el reporte anual para ver cuánto depende de sus clientes.");
  }

  // Inventario
  const inv = i.inventario;
  if (inv) {
    const brecha = inv.inventarioPct - inv.ventasPct;
    if (brecha > 20) puntos -= 1;
    if (brecha < -20 && inv.ventasPct > 0) puntos += 1;
    detalles.push(`Inventario contra ventas (al ${fechaCorta(inv.fecha)}): la mercancía guardada cambió ${pct(inv.inventarioPct)} en un año y las ventas del trimestre ${pct(inv.ventasPct)}. `
      + (brecha > 20 ? "Se le está acumulando mercancía más rápido de lo que vende: posible atasco o demanda que se enfría."
        : brecha < -20 && inv.ventasPct > 0 ? "Vende más rápido de lo que guarda: la demanda va por delante."
          : "Van más o menos al mismo paso: nada raro."));
  }

  // Avisos
  if (i.avisos.length > 0) {
    puntos -= 1;
    detalles.push(`${i.avisos.length} ${i.avisos.length === 1 ? "aviso reciente de evento (8-K) habla" : "avisos recientes de eventos (8-K) hablan"} de aranceles, controles de exportación o escasez.`);
    for (const a of i.avisos.slice(0, 2)) fuentes.push({ texto: `Aviso del ${fechaCorta(a.fecha)}`, url: a.url });
  }

  detalles.push("Lo que NO se puede ver con tu plan de datos: el mapa real de proveedores y clientes por nombre.");

  const tono: LecturaSuministro["tono"] = puntos >= 1 ? "up" : puntos <= -2 ? "down" : "neutral";
  const concentrada = c?.mayorPct != null && (c.mayorPct >= 30 || (!c.agrupado && c.mayorPct >= 20));
  const senal = tono === "down" ? "Riesgo de suministro"
    : concentrada ? "Depende de pocos clientes"
      : tono === "up" ? "Demanda por delante"
        : "Sin nada raro";

  const viendo = [
    c?.mayorPct != null ? (c.agrupado ? `sus clientes más grandes son el ${c.mayorPct}% de las ventas` : `un cliente es el ${c.mayorPct}% de las ventas`)
      : c ? "no depende de un cliente en particular" : null,
    inv ? `inventario ${pct(inv.inventarioPct)} y ventas ${pct(inv.ventasPct)} en un año` : null,
  ].filter(Boolean).join("; ");

  const empuje = concentrada
    ? "Ojo con las noticias de sus clientes grandes: lo que les pase a ellos le pega a esta acción. Esto pesa a mediano plazo."
    : tono === "down"
      ? "Hay señales de problemas para vender o para conseguir lo que necesita: más cuidado si vas a apostar a que sube por semanas."
      : "Nada de la cadena de suministro empuja ni frena la idea.";

  return {
    senal, tono,
    viendo: viendo ? `${viendo[0].toUpperCase()}${viendo.slice(1)}.` : "Con pocos datos de suministro.",
    empuje, detalles, fuentes,
  };
}
