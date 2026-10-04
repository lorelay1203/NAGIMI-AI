// 🏛️ GOV · Gobernanza — "¿qué está haciendo la gente de adentro?".
//
// El ROL PLANEADO de Aetheris para este agente es:
//   · track litigation and governance    → demandas y dinero apartado para ellas
//   · summarize board and comp signals   → directivos comprando o vendiendo
//   · flag regulatory events             → eventos importantes del 8-K
//   · cite primary sources               → cada cosa con su enlace a sec.gov
//
// Todo sale de fuentes gratis ya probadas (SEC y Finnhub). Esto es puro y con
// pruebas; la ruta /api/gobernanza junta los datos.

// ---------------------------------------------------------------------------
// 1) Directivos comprando o vendiendo (Form 4)
// ---------------------------------------------------------------------------

export interface TransaccionInsider {
  name: string;
  /** Acciones que cambiaron (+ compra, − venta). */
  change: number;
  transactionCode: string;
  transactionPrice: number | null;
  transactionDate: string; // YYYY-MM-DD
  isDerivative?: boolean;
}

export interface ResumenInsiders {
  /** Compras con su propio dinero en el mercado (código P). */
  compras: { n: number; valor: number; personas: string[]; mayor: TransaccionInsider | null };
  /** Ventas en el mercado (código S). Muchas son planes automáticos. */
  ventas: { n: number; valor: number; personas: string[] };
  /** Todo lo demás: premios en acciones, ejercicio de opciones, impuestos, regalos. */
  otras: number;
  dias: number;
}

function diasEntre(a: string, b: Date): number {
  const t = new Date(`${a}T12:00:00Z`).getTime();
  return Number.isFinite(t) ? (b.getTime() - t) / 86_400_000 : Infinity;
}

export function resumenInsiders(tx: TransaccionInsider[], hoy: Date, dias = 90): ResumenInsiders {
  const r: ResumenInsiders = {
    compras: { n: 0, valor: 0, personas: [], mayor: null },
    ventas: { n: 0, valor: 0, personas: [] },
    otras: 0,
    dias,
  };
  for (const t of tx) {
    if (t.isDerivative) continue;
    const d = diasEntre(t.transactionDate, hoy);
    if (d < 0 || d > dias) continue;
    const valor = Math.abs(t.change) * (t.transactionPrice ?? 0);
    if (t.transactionCode === "P" && t.change > 0) {
      r.compras.n++;
      r.compras.valor += valor;
      if (!r.compras.personas.includes(t.name)) r.compras.personas.push(t.name);
      const mayorValor = r.compras.mayor ? Math.abs(r.compras.mayor.change) * (r.compras.mayor.transactionPrice ?? 0) : -1;
      if (valor > mayorValor) r.compras.mayor = t;
    } else if (t.transactionCode === "S" && t.change < 0) {
      r.ventas.n++;
      r.ventas.valor += valor;
      if (!r.ventas.personas.includes(t.name)) r.ventas.personas.push(t.name);
    } else {
      r.otras++;
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// 2) Eventos importantes (8-K)
// ---------------------------------------------------------------------------

export type Gravedad = "roja" | "amarilla" | "info";

/** Qué significa cada "item" de un 8-K, en palabras, y qué tan serio es. */
export const ITEMS_8K: Record<string, { texto: string; gravedad: Gravedad }> = {
  "1.01": { texto: "firmó un acuerdo importante", gravedad: "info" },
  "1.02": { texto: "se canceló un acuerdo importante", gravedad: "amarilla" },
  "1.03": { texto: "se declaró en quiebra", gravedad: "roja" },
  "1.05": { texto: "sufrió un ataque de ciberseguridad importante", gravedad: "amarilla" },
  "2.01": { texto: "compró o vendió un negocio o activos grandes", gravedad: "info" },
  "2.02": { texto: "publicó sus resultados", gravedad: "info" },
  "2.03": { texto: "tomó una deuda nueva importante", gravedad: "info" },
  "2.04": { texto: "algo hizo que una deuda se tenga que pagar antes", gravedad: "roja" },
  "2.05": { texto: "anunció recortes o despidos con costo", gravedad: "amarilla" },
  "2.06": { texto: "reconoció que algo que tenía vale menos (pérdida de valor)", gravedad: "amarilla" },
  "3.01": { texto: "recibió aviso de que la pueden sacar de la bolsa", gravedad: "roja" },
  "3.02": { texto: "vendió acciones nuevas sin oferta pública", gravedad: "amarilla" },
  "3.03": { texto: "cambió los derechos de los accionistas", gravedad: "amarilla" },
  "4.01": { texto: "cambió de auditor", gravedad: "amarilla" },
  "4.02": { texto: "dijo que sus estados financieros anteriores ya no son confiables", gravedad: "roja" },
  "5.01": { texto: "cambió quién controla la empresa", gravedad: "amarilla" },
  "5.02": { texto: "entró o salió un directivo o miembro de la junta", gravedad: "amarilla" },
  "5.03": { texto: "cambió sus estatutos o su año fiscal", gravedad: "info" },
  "5.07": { texto: "los accionistas votaron en la junta", gravedad: "info" },
  "7.01": { texto: "publicó información para inversionistas", gravedad: "info" },
  "8.01": { texto: "reportó otro evento", gravedad: "info" },
};

export interface Filing {
  form: string;
  filingDate: string;
  items: string;
  url: string;
}

export interface Evento {
  fecha: string;
  url: string;
  cosas: { codigo: string; texto: string; gravedad: Gravedad }[];
  gravedad: Gravedad;
}

const ORDEN: Record<Gravedad, number> = { roja: 2, amarilla: 1, info: 0 };

export function eventos8K(filings: Filing[], hoy: Date, dias = 120): Evento[] {
  const out: Evento[] = [];
  for (const f of filings) {
    if (!f.form.startsWith("8-K")) continue;
    const d = diasEntre(f.filingDate, hoy);
    if (d < 0 || d > dias) continue;
    const cosas = f.items.split(",").map((s) => s.trim()).filter((c) => ITEMS_8K[c])
      .map((c) => ({ codigo: c, ...ITEMS_8K[c] }));
    if (cosas.length === 0) continue;
    const gravedad = cosas.reduce<Gravedad>((g, c) => (ORDEN[c.gravedad] > ORDEN[g] ? c.gravedad : g), "info");
    out.push({ fecha: f.filingDate, url: f.url, cosas, gravedad });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---------------------------------------------------------------------------
// 3) Demandas
// ---------------------------------------------------------------------------

export interface Demandas {
  /** Dinero apartado para demandas en el último reporte, en $. */
  apartadoAhora: number | null;
  /** Lo mismo, un año antes (para ver si sube). */
  apartadoAntes: number | null;
  /** Fecha del último dato. */
  fecha: string | null;
  /** Avisos de eventos (8-K) recientes que hablan de demandas o investigaciones. */
  avisos: { fecha: string; url: string }[];
}

// ---------------------------------------------------------------------------
// 4) La lectura completa
// ---------------------------------------------------------------------------

export interface LecturaGobernanza {
  senal: string;
  tono: "up" | "down" | "neutral";
  viendo: string;
  empuje: string;
  detalles: string[];
  fuentes: { texto: string; url: string }[];
}

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)} mil millones`
    : n >= 1e6 ? `$${(n / 1e6).toFixed(1)} millones`
      : `$${Math.round(n).toLocaleString("en-US")}`;

/** "TAN LIP BU" → "Tan Lip Bu". */
export function nombreBonito(n: string): string {
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("es-PR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function lecturaGobernanza(i: {
  ticker: string;
  insiders: ResumenInsiders | null;
  eventos: Evento[] | null;
  demandas: Demandas | null;
  enlaceInsiders?: string;
}): LecturaGobernanza {
  const detalles: string[] = [];
  const fuentes: { texto: string; url: string }[] = [];
  let puntos = 0; // + a favor, − en contra

  // Directivos
  if (i.insiders) {
    const { compras, ventas, dias } = i.insiders;
    if (compras.n > 0) {
      puntos += compras.valor >= 1e6 ? 2 : 1;
      const m = compras.mayor!;
      detalles.push(`En los últimos ${dias} días, ${compras.personas.length} ${compras.personas.length === 1 ? "directivo compró" : "directivos compraron"} acciones con su propio dinero `
        + `(${usd(compras.valor)} en total). La mayor: ${nombreBonito(m.name)}, ${Math.round(m.change).toLocaleString("en-US")} acciones a $${(m.transactionPrice ?? 0).toFixed(2)} el ${fechaCorta(m.transactionDate)}. `
        + "Cuando alguien de adentro compra con su dinero, casi siempre es porque cree que la acción vale más.");
    }
    if (ventas.n > 0) {
      if (ventas.valor > 5 * Math.max(compras.valor, 1) && ventas.valor >= 5e6) puntos -= 1;
      detalles.push(`${ventas.personas.length} ${ventas.personas.length === 1 ? "directivo vendió" : "directivos vendieron"} ${usd(ventas.valor)} en ${ventas.n} ${ventas.n === 1 ? "venta" : "ventas"}. `
        + "Ojo: muchas ventas de directivos son planes automáticos o para pagar impuestos, así que pesan mucho menos que una compra.");
    }
    if (compras.n === 0 && ventas.n === 0) {
      detalles.push(`Ningún directivo compró ni vendió en el mercado en los últimos ${dias} días.`);
    }
    if (i.enlaceInsiders) fuentes.push({ texto: "Movimientos de directivos (Form 4) en la SEC", url: i.enlaceInsiders });
  }

  // Eventos
  if (i.eventos) {
    const rojos = i.eventos.filter((e) => e.gravedad === "roja");
    const amarillos = i.eventos.filter((e) => e.gravedad === "amarilla");
    puntos -= rojos.length * 2 + (amarillos.length >= 3 ? 1 : 0);
    for (const e of [...rojos, ...amarillos].slice(0, 4)) {
      detalles.push(`${e.gravedad === "roja" ? "🔴" : "🟡"} ${fechaCorta(e.fecha)}: ${e.cosas.filter((c) => c.gravedad !== "info").map((c) => c.texto).join("; ")}.`);
      fuentes.push({ texto: `Aviso 8-K del ${fechaCorta(e.fecha)}`, url: e.url });
    }
    if (rojos.length === 0 && amarillos.length === 0) {
      detalles.push(i.eventos.length > 0
        ? `En los últimos 4 meses reportó ${i.eventos.length} ${i.eventos.length === 1 ? "evento" : "eventos"} a la SEC, todos de rutina (resultados, acuerdos, juntas).`
        : "No reportó eventos importantes a la SEC en los últimos 4 meses.");
    }
  }

  // Demandas
  if (i.demandas) {
    const d = i.demandas;
    if (d.apartadoAhora != null && d.apartadoAhora > 0) {
      const sube = d.apartadoAntes != null && d.apartadoAntes > 0 && d.apartadoAhora > d.apartadoAntes * 1.5;
      if (sube) puntos -= 1;
      detalles.push(`Tiene ${usd(d.apartadoAhora)} apartados para demandas${d.fecha ? ` (reporte del ${fechaCorta(d.fecha)})` : ""}`
        + (d.apartadoAntes != null && d.apartadoAntes > 0
          ? sube ? `, bastante más que hace un año (${usd(d.apartadoAntes)}).` : `; hace un año eran ${usd(d.apartadoAntes)}.`
          : "."));
    }
    if (d.avisos.length > 0) {
      puntos -= 1;
      detalles.push(`${d.avisos.length} ${d.avisos.length === 1 ? "aviso reciente de evento habla" : "avisos recientes de eventos hablan"} de demandas, acuerdos legales o investigaciones.`);
      for (const a of d.avisos.slice(0, 2)) fuentes.push({ texto: `Aviso legal del ${fechaCorta(a.fecha)}`, url: a.url });
    }
  }

  const tono: LecturaGobernanza["tono"] = puntos >= 2 ? "up" : puntos <= -2 ? "down" : "neutral";
  const hayRojo = i.eventos?.some((e) => e.gravedad === "roja") ?? false;
  const compraFuerte = (i.insiders?.compras.valor ?? 0) >= 1e6;

  const ventaFuerte = (i.insiders?.compras.n ?? 0) === 0 && (i.insiders?.ventas.valor ?? 0) >= 1e7;

  const senal = hayRojo ? "Alerta roja"
    : compraFuerte ? "Directivos comprando"
      : ventaFuerte ? "Directivos vendiendo"
      : tono === "down" ? "Señales de cuidado"
        : tono === "up" ? "A favor"
          : "Sin nada raro";

  // "Ahora" es el resumen en una línea; el detalle completo va debajo.
  const rojo = i.eventos?.find((e) => e.gravedad === "roja");
  const c = i.insiders?.compras;
  const v = i.insiders?.ventas;
  const viendo = rojo
    ? `Evento serio el ${fechaCorta(rojo.fecha)}: ${rojo.cosas.find((x) => x.gravedad === "roja")?.texto}.`
    : compraFuerte && c
      ? `${c.personas.length} ${c.personas.length === 1 ? "directivo compró" : "directivos compraron"} ${usd(c.valor)} en acciones con su propio dinero (últimos ${i.insiders!.dias} días).`
      : ventaFuerte && v
        ? `Directivos vendieron ${usd(v.valor)} y nadie compró (últimos ${i.insiders!.dias} días).`
        : detalles.length > 0
          ? "Nada fuera de lo normal en la gente de adentro de la empresa."
          : "No se pudo leer nada de la gente de adentro para este ticker.";
  const empuje = hayRojo
    ? "Hay un evento serio reportado a la SEC. Antes de operar, lee el aviso: esto puede mover la acción mucho más que cualquier muro de opciones."
    : compraFuerte
      ? "La gente de adentro está poniendo su dinero. No es garantía, pero es de las señales más confiables que hay a mediano plazo."
      : ventaFuerte
        ? "Los de adentro están vendiendo mucho y nadie está comprando. Casi siempre son ventas planificadas, así que no es señal de que sepan algo malo, pero tampoco hay nadie de adentro apostando a que sube."
      : tono === "down"
        ? "Hay varias señales de cuidado de adentro de la empresa: tenlo en cuenta si vas a apostar a que sube."
        : "Nada de adentro de la empresa empuja ni frena la idea.";

  return { senal, tono, viendo, empuje, detalles, fuentes };
}
