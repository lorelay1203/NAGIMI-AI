// 📰 SNT · Sentimiento — "¿qué dicen de esta acción, y quién lo dice?".
//
// El ROL PLANEADO de Aetheris para este agente es:
//   · add verified news lookup     → titulares del ticker (ya existía)
//   · flag stale sources           → avisar si la noticia ya está vieja (ya existía)
//   · score source reliability     → NUEVO: cada fuente pesa según qué tan confiable es
//   · summarize transcript tone    → no disponible en el plan (Finnhub 403); en su
//                                    lugar, el tono de los ANALISTAS mes a mes.
//
// Lo que descubrimos al armarlo: casi todos los titulares de empresas que llegan
// vienen de sitios de recomendaciones (The Motley Fool, Zacks), que escriben
// para vender suscripciones. Contarlos igual que a Reuters inflaba el tono. Por
// eso ahora cada titular pesa según su fuente y el agente avisa cuando casi
// todo viene de fuentes flojas.

export type Nivel = "alta" | "media" | "baja";

export interface Fiabilidad {
  nivel: Nivel;
  /** Cuánto pesa un titular de esta fuente (alta 1, media 0.6, baja 0.25). */
  peso: number;
  porQue: string;
}

const PESO: Record<Nivel, number> = { alta: 1, media: 0.6, baja: 0.25 };

/** Fuentes conocidas. Se busca por palabra contenida en el nombre, sin mayúsculas. */
const FUENTES: { claves: string[]; nivel: Nivel; porQue: string }[] = [
  { claves: ["reuters", "bloomberg", "associated press", "ap news", "wall street journal", "wsj", "financial times", "barron"],
    nivel: "alta", porQue: "agencia o diario financiero con redacción y verificación propia" },
  { claves: ["sec.gov", "securities and exchange"], nivel: "alta", porQue: "documento oficial de la SEC" },
  { claves: ["globenewswire", "business wire", "businesswire", "pr newswire", "prnewswire", "accesswire"],
    nivel: "media", porQue: "comunicado de la propia empresa: el dato es oficial, pero es su versión" },
  { claves: ["cnbc", "marketwatch", "investing.com", "yahoo", "benzinga", "the fly", "thefly", "investor's business daily", "ibd"],
    nivel: "media", porQue: "medio financiero de noticias rápidas" },
  { claves: ["motley fool", "zacks", "seeking alpha", "seekingalpha", "investorplace", "tipranks", "chartmill", "simply wall", "24/7 wall", "insidermonkey", "insider monkey"],
    nivel: "baja", porQue: "sitio de opiniones y recomendaciones, muchas veces para vender suscripciones" },
];

export function fiabilidadFuente(publisher: string | null | undefined): Fiabilidad {
  const p = (publisher ?? "").toLowerCase();
  for (const f of FUENTES) {
    if (f.claves.some((c) => p.includes(c))) return { nivel: f.nivel, peso: PESO[f.nivel], porQue: f.porQue };
  }
  return { nivel: "media", peso: 0.5, porQue: "fuente que Nagimi no tiene clasificada" };
}

// ---------------------------------------------------------------------------
// Tono de las noticias, pesado por fuente y por frescura
// ---------------------------------------------------------------------------

export interface Titular {
  publisher: string;
  publishedUtc: string;
  sentiment: "positive" | "negative" | "neutral" | null;
}

export interface TonoNoticias {
  /** −1 (muy negativo) … +1 (muy positivo). */
  score: number;
  aFavor: number;
  enContra: number;
  neutrales: number;
  /** Cuántos titulares por nivel de confiabilidad. */
  porNivel: Record<Nivel, number>;
  /** Parte del peso total que viene de fuentes de confiabilidad baja (0-1). */
  pesoFlojo: number;
  /** Horas desde el titular más reciente. */
  horasUltimo: number | null;
}

/** Media vida de 48 h: un titular de hace dos días pesa la mitad. */
function frescura(iso: string, ahora: Date): number {
  const h = (ahora.getTime() - new Date(iso).getTime()) / 3_600_000;
  return Number.isFinite(h) ? Math.pow(0.5, Math.max(0, h) / 48) : 0;
}

export function tonoNoticias(titulares: Titular[], ahora: Date): TonoNoticias | null {
  if (titulares.length === 0) return null;
  let num = 0, den = 0, flojo = 0, total = 0;
  const r: TonoNoticias = {
    score: 0, aFavor: 0, enContra: 0, neutrales: 0,
    porNivel: { alta: 0, media: 0, baja: 0 }, pesoFlojo: 0, horasUltimo: null,
  };
  let ultimo = -Infinity;
  for (const t of titulares) {
    const f = fiabilidadFuente(t.publisher);
    r.porNivel[f.nivel]++;
    const ms = new Date(t.publishedUtc).getTime();
    if (Number.isFinite(ms)) ultimo = Math.max(ultimo, ms);
    const w = f.peso * frescura(t.publishedUtc, ahora);
    total += w;
    if (f.nivel === "baja") flojo += w;
    if (!t.sentiment) continue;
    if (t.sentiment === "positive") { r.aFavor++; num += w; }
    else if (t.sentiment === "negative") { r.enContra++; num -= w; }
    else r.neutrales++;
    den += w;
  }
  r.score = den > 0 ? num / den : 0;
  r.pesoFlojo = total > 0 ? flojo / total : 0;
  r.horasUltimo = Number.isFinite(ultimo) ? (ahora.getTime() - ultimo) / 3_600_000 : null;
  return r;
}

// ---------------------------------------------------------------------------
// Tono de los analistas (Finnhub, mes a mes)
// ---------------------------------------------------------------------------

export interface MesAnalistas {
  period: string; // YYYY-MM-DD
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface TonoAnalistas {
  total: number;
  /** % que dice comprar (compra fuerte + compra). */
  pctCompra: number;
  /** % que dice vender (venta + venta fuerte). */
  pctVenta: number;
  /** Cambio del % que dice comprar contra hace ~3 meses, en puntos. null si no hay historia. */
  cambio3m: number | null;
  mes: string;
}

export function tonoAnalistas(meses: MesAnalistas[]): TonoAnalistas | null {
  const orden = [...meses].sort((a, b) => b.period.localeCompare(a.period));
  const pct = (m: MesAnalistas) => {
    const total = m.strongBuy + m.buy + m.hold + m.sell + m.strongSell;
    return total > 0
      ? { total, compra: ((m.strongBuy + m.buy) / total) * 100, venta: ((m.sell + m.strongSell) / total) * 100 }
      : null;
  };
  const ahora = orden[0] ? pct(orden[0]) : null;
  if (!ahora) return null;
  const antes = orden[3] ? pct(orden[3]) : null;
  return {
    total: ahora.total,
    pctCompra: ahora.compra,
    pctVenta: ahora.venta,
    cambio3m: antes ? ahora.compra - antes.compra : null,
    mes: orden[0].period,
  };
}

// ---------------------------------------------------------------------------
// La lectura completa
// ---------------------------------------------------------------------------

export interface LecturaSentimiento {
  senal: string;
  tono: "up" | "down" | "neutral";
  viendo: string;
  empuje: string;
  detalles: string[];
}

/** Casi todo de sitios de recomendaciones: por peso o por cantidad (70% o más). */
export function casiTodoFlojo(n: TonoNoticias): boolean {
  const total = n.porNivel.alta + n.porNivel.media + n.porNivel.baja;
  return n.pesoFlojo >= 0.5 || (total > 0 && n.porNivel.baja / total >= 0.7);
}

export function lecturaSentimiento(i: {
  ticker: string;
  noticias: TonoNoticias | null;
  analistas: TonoAnalistas | null;
  /** Cuántas fuentes de noticias respondieron. */
  feedsOk?: number;
  feedsTotal?: number;
}): LecturaSentimiento | null {
  const { noticias: n, analistas: a } = i;
  if (!n && !a) return null;
  const detalles: string[] = [];

  // Noticias
  let tonoN: "up" | "down" | "neutral" = "neutral";
  if (n) {
    tonoN = n.score >= 0.25 ? "up" : n.score <= -0.25 ? "down" : "neutral";
    const total = n.porNivel.alta + n.porNivel.media + n.porNivel.baja;
    detalles.push(`${total} titulares: ${n.aFavor} a favor, ${n.enContra} en contra, ${n.neutrales} neutrales — `
      + `contando más los de fuentes serias y los más frescos, el tono queda ${tonoN === "up" ? "a favor" : tonoN === "down" ? "en contra" : "neutral"}.`);
    detalles.push(`Quién lo dice: ${n.porNivel.alta} de fuentes muy confiables (agencias, diarios, la SEC), `
      + `${n.porNivel.media} de medios rápidos o comunicados de la empresa, y ${n.porNivel.baja} de sitios de recomendaciones.`);
    if (casiTodoFlojo(n)) {
      detalles.push("⚠ Más de la mitad de lo que pesa viene de sitios de recomendaciones (como Motley Fool o Zacks), que escriben para vender suscripciones. Toma este tono con pinzas.");
    }
    if (n.horasUltimo != null) {
      detalles.push(n.horasUltimo >= 48
        ? `⚠ El titular más reciente ya tiene ${Math.round(n.horasUltimo / 24)} días: son noticias viejas, no las uses como razón para entrar hoy.`
        : `El titular más reciente es de hace ${Math.max(1, Math.round(n.horasUltimo))} h.`);
    }
  }
  if (i.feedsOk != null && i.feedsTotal != null && i.feedsOk < i.feedsTotal) {
    detalles.push(`Respondieron ${i.feedsOk} de ${i.feedsTotal} fuentes de noticias.`);
  }

  // Analistas
  let tonoA: "up" | "down" | "neutral" = "neutral";
  if (a) {
    tonoA = a.pctCompra >= 60 && a.pctVenta < 10 ? "up" : a.pctVenta >= 25 ? "down" : "neutral";
    const giro = a.cambio3m == null ? ""
      : Math.abs(a.cambio3m) < 3 ? " Casi igual que hace 3 meses."
        : a.cambio3m > 0 ? ` Son ${a.cambio3m.toFixed(0)} puntos más que hace 3 meses: los analistas se están animando.`
          : ` Son ${Math.abs(a.cambio3m).toFixed(0)} puntos menos que hace 3 meses: los analistas se están enfriando.`;
    detalles.push(`Analistas (${a.total}): ${Math.round(a.pctCompra)}% dice comprar, ${Math.round(a.pctVenta)}% dice vender, `
      + `el resto dice mantener.${giro}`);
  }

  // Juntar: los analistas pesan igual que las noticias. Las noticias pesan la
  // mitad si casi todas son de fuentes flojas, y otra mitad si ya están viejas.
  const val = (t: "up" | "down" | "neutral") => (t === "up" ? 1 : t === "down" ? -1 : 0);
  const viejas = n?.horasUltimo != null && n.horasUltimo >= 48;
  const pesoN = n ? (casiTodoFlojo(n) ? 0.5 : 1) * (viejas ? 0.5 : 1) : 0;
  const pesoA = a ? 1 : 0;
  const s = (val(tonoN) * pesoN + val(tonoA) * pesoA) / Math.max(pesoN + pesoA, 1);
  const tono: LecturaSentimiento["tono"] = s >= 0.5 ? "up" : s <= -0.5 ? "down" : "neutral";

  const choque = n && a && tonoN !== "neutral" && tonoA !== "neutral" && tonoN !== tonoA;
  const senal = choque ? "Noticias y analistas chocan"
    : tono === "up" ? "Sentimiento a favor"
      : tono === "down" ? "Sentimiento en contra"
        : "Sentimiento neutral";

  const viendo = [
    n ? `noticias ${tonoN === "up" ? "a favor" : tonoN === "down" ? "en contra" : "neutrales"}`
      + `${casiTodoFlojo(n) ? " (casi todo de fuentes flojas)" : ""}${viejas ? " y viejas" : ""}` : null,
    a ? `${Math.round(a.pctCompra)}% de los analistas dice comprar${a.cambio3m != null && Math.abs(a.cambio3m) >= 3 ? (a.cambio3m > 0 ? ", y subiendo" : ", y bajando") : ""}` : null,
  ].filter(Boolean).join("; ");

  const empuje = choque
    ? "Las noticias dicen una cosa y los analistas otra: el sentimiento no decide nada hoy. Hazle caso al flujo de opciones y a los muros."
    : tono === "neutral"
      ? "El sentimiento no inclina la balanza."
      : `El ambiente es ${tono === "up" ? "positivo" : "negativo"}. Si el flujo de opciones apunta al lado contrario, hazle caso al flujo: el dinero se mueve antes que los titulares.`;

  return { senal, tono, viendo: `${viendo[0].toUpperCase()}${viendo.slice(1)}.`, empuje, detalles };
}
