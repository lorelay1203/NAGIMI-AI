// ============================================================================
// "Sigue a los Grandes" — jugadas de inversores gigantes desde los reportes
// 13F de la SEC (obligatorios, oficiales, GRATIS). Compara los dos trimestres
// más recientes para ver qué compraron nuevo, aumentaron, recortaron o vendieron.
//
// ⚠️ El 13F es TRIMESTRAL y llega ~45 días tarde, y muestra ACCIONES (largo
// plazo), no opciones ni el minuto exacto. Es la convicción del gran inversor,
// que luego cruzamos con el flujo de opciones en vivo para armar ideas baratas.
//
// Fuente: data.sec.gov (requiere User-Agent). Sin API key.
// ============================================================================

const UA = { "User-Agent": "Nagimi AI research (lorelaytoro@gmail.com)" };

/** Estilo del inversor, para agrupar el selector (son muchos). */
export type InvestorGroup = "valor" | "activista" | "crecimiento" | "macro" | "cuantitativo";

export const GROUP_LABEL: Record<InvestorGroup, string> = {
  valor: "💎 Leyendas del valor — compran barato y aguantan años",
  activista: "🎯 Activistas y contrarios — pelean con las empresas o van contra la corriente",
  crecimiento: "🚀 Crecimiento y tecnología — apuestan al futuro, más volátiles",
  macro: "🌍 Macro — apuestan a la economía entera, no a una empresa",
  cuantitativo: "🤖 Cuantitativos y gigantes — computadoras y coberturas, no convicción",
};

export interface Investor { id: string; name: string; fund: string; cik: string; group: InvestorGroup; note?: string }

// Inversores famosos que SÍ reportan 13F. Cada CIK fue verificado contra
// data.sec.gov comprobando que tenga un 13F-HR presentado recientemente.
//
// No incluimos fondos índice (BlackRock, Vanguard, State Street): tienen casi
// todo el mercado, así que sus "jugadas" no son convicción, son el índice.
export const INVESTORS: Investor[] = [
  // 💎 Valor: compran barato y aguantan años.
  { id: "buffett", name: "Warren Buffett", fund: "Berkshire Hathaway", cik: "1067983", group: "valor" },
  { id: "klarman", name: "Seth Klarman", fund: "Baupost Group", cik: "1061768", group: "valor", note: "Muy conservador: suele tener mucho efectivo esperando gangas." },
  { id: "marks", name: "Howard Marks", fund: "Oaktree Capital", cik: "949509", group: "valor", note: "Especialista en deuda y activos en problemas." },
  { id: "lilu", name: "Li Lu", fund: "Himalaya Capital", cik: "1709323", group: "valor", note: "El inversor en quien Charlie Munger confió su dinero. Cartera muy concentrada." },
  { id: "akre", name: "Akre Capital", fund: "Akre Capital Management", cik: "1112520", group: "valor", note: "Compra negocios de mucha calidad y casi no los toca." },
  { id: "berkowitz", name: "Bruce Berkowitz", fund: "Fairholme Capital", cik: "1056831", group: "valor", note: "Cartera extremadamente concentrada en pocas apuestas." },
  { id: "gates", name: "Fundación Gates", fund: "Gates Foundation Trust", cik: "1166559", group: "valor", note: "Es un fideicomiso benéfico: vende para financiar donaciones, no siempre por opinión de mercado." },

  // 🎯 Activistas y contrarios.
  { id: "burry", name: "Michael Burry", fund: "Scion Asset Management", cik: "1649339", group: "activista", note: "⚠️ Su último reporte a la SEC es de noviembre 2025: lo que ves aquí está viejo, no es su cartera de hoy. Cartera chica y cambia mucho." },
  { id: "ackman", name: "Bill Ackman", fund: "Pershing Square", cik: "1336528", group: "activista" },
  { id: "loeb", name: "Daniel Loeb", fund: "Third Point", cik: "1040273", group: "activista" },
  { id: "singer", name: "Paul Singer", fund: "Elliott Management", cik: "1791786", group: "activista", note: "Presiona a las empresas para que cambien y suba la acción." },
  { id: "starboard", name: "Starboard Value", fund: "Starboard Value LP", cik: "1517137", group: "activista" },
  { id: "farallon", name: "Farallon", fund: "Farallon Capital", cik: "909661", group: "activista", note: "Apuesta a eventos concretos (fusiones, quiebras), no solo a que suba." },
  { id: "peltz", name: "Nelson Peltz", fund: "Trian Fund Management", cik: "1345471", group: "activista", note: "Entra en pocas empresas grandes y pelea por un puesto en la junta." },
  { id: "valueact", name: "ValueAct", fund: "ValueAct Holdings", cik: "1418814", group: "activista", note: "Activista tranquilo: negocia por dentro en vez de pelear en público." },

  // 🚀 Crecimiento y tecnología.
  { id: "wood", name: "Cathie Wood", fund: "ARK Invest", cik: "1697748", group: "crecimiento", note: "Muy agresiva en tecnología: sube y baja fuerte." },
  { id: "tiger", name: "Tiger Global", fund: "Tiger Global Management", cik: "1167483", group: "crecimiento" },
  { id: "coatue", name: "Philippe Laffont", fund: "Coatue Management", cik: "1135730", group: "crecimiento" },
  { id: "lonepine", name: "Lone Pine", fund: "Lone Pine Capital", cik: "1061165", group: "crecimiento" },
  { id: "viking", name: "Viking Global", fund: "Viking Global Investors", cik: "1103804", group: "crecimiento" },
  { id: "altimeter", name: "Brad Gerstner", fund: "Altimeter Capital", cik: "1541617", group: "crecimiento" },
  { id: "whalerock", name: "Whale Rock", fund: "Whale Rock Capital", cik: "1387322", group: "crecimiento" },
  { id: "maverick", name: "Maverick Capital", fund: "Maverick Capital Ltd", cik: "934639", group: "crecimiento" },
  { id: "polen", name: "Polen Capital", fund: "Polen Capital Management", cik: "1034524", group: "crecimiento", note: "Busca empresas de calidad que crezcan; cartera concentrada y paciente." },

  // 🌍 Macro: apuestan a la economía entera.
  { id: "dalio", name: "Ray Dalio", fund: "Bridgewater Associates", cik: "1350694", group: "macro" },
  { id: "tepper", name: "David Tepper", fund: "Appaloosa", cik: "1656456", group: "macro" },
  { id: "druckenmiller", name: "Stanley Druckenmiller", fund: "Duquesne Family Office", cik: "1536411", group: "macro", note: "Cambia de opinión rápido: el 13F llega tarde para seguirlo de cerca." },
  { id: "soros", name: "Soros Fund", fund: "Soros Fund Management", cik: "1029160", group: "macro" },
  { id: "tudor", name: "Paul Tudor Jones", fund: "Tudor Investment Corp", cik: "923093", group: "macro", note: "Opera muy rápido y con opciones: el 13F solo enseña una parte." },

  // 🤖 Cuantitativos y gigantes: computadoras y coberturas.
  { id: "citadel", name: "Citadel (Ken Griffin)", fund: "Citadel Advisors", cik: "1423053", group: "cuantitativo", note: "Gran market maker: sus posiciones suelen ser coberturas, no apuestas direccionales." },
  { id: "rentec", name: "Renaissance", fund: "Renaissance Technologies", cik: "1037389", group: "cuantitativo", note: "Todo lo decide una computadora, con miles de posiciones chicas. No hay una 'tesis' que copiar." },
  { id: "twosigma", name: "Two Sigma", fund: "Two Sigma Investments", cik: "1179392", group: "cuantitativo", note: "Cuantitativo: cientos de posiciones, no convicción individual." },
  { id: "millennium", name: "Millennium", fund: "Millennium Management", cik: "1273087", group: "cuantitativo", note: "Muchos equipos independientes: la cartera es una mezcla, no una sola opinión." },
  { id: "point72", name: "Steve Cohen", fund: "Point72 Asset Management", cik: "1603466", group: "cuantitativo", note: "Rota muy rápido: para cuando sale el 13F puede haber cambiado." },
  { id: "gotham", name: "Joel Greenblatt", fund: "Gotham Asset Management", cik: "1510387", group: "cuantitativo", note: "Value por fórmula: cientos de posiciones chicas elegidas por sistema." },
  { id: "marshallwace", name: "Marshall Wace", fund: "Marshall Wace LLP", cik: "1318757", group: "cuantitativo", note: "Long/short sistemático: tiene acciones y también apuesta en contra de otras." },
  { id: "aqr", name: "AQR (Cliff Asness)", fund: "AQR Capital Management", cik: "1167557", group: "cuantitativo", note: "Cuantitativo puro: sigue factores (valor, momentum), no historias de empresas." },
];

export type MoveKind = "nueva" | "aumento" | "recorte" | "salida" | "mantiene";
export interface Move {
  name: string;
  ticker: string | null;
  kind: MoveKind;
  direction: "alcista" | "bajista" | "neutral";
  value: number;      // valor actual $ (0 si salió)
  shares: number;     // acciones ahora
  prevShares: number; // acciones el trimestre anterior
  pctOfPortfolio: number;
  changePct: number | null;
}
export interface FundReport {
  investor: string; fund: string;
  periodNow: string; periodPrev: string | null; filedNow: string;
  totalValue: number; positions: number;
  moves: Move[];
  note?: string;
}

async function sec<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC ${res.status} en ${url}`);
  return (await res.json()) as T;
}

// Mapas nombre→ticker de la SEC (company_tickers.json), cacheados en memoria.
// `exact` casa el nombre normalizado; `sorted` casa con las palabras en otro
// orden. En `sorted` descartamos las claves ambiguas (dos empresas distintas con
// las mismas palabras) para no devolver NUNCA un ticker equivocado.
let tickerMaps: { exact: Map<string, string>; sorted: Map<string, string> } | null = null;
async function loadTickerMap(): Promise<{ exact: Map<string, string>; sorted: Map<string, string> }> {
  if (tickerMaps) return tickerMaps;
  const j = await sec<Record<string, { ticker: string; title: string }>>("https://www.sec.gov/files/company_tickers.json").catch(() => ({} as Record<string, { ticker: string; title: string }>));
  const exact = new Map<string, string>();
  const sorted = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const k of Object.keys(j)) {
    const { title, ticker } = j[k];
    const norm = normName(title);
    if (!norm) continue;
    if (!exact.has(norm)) exact.set(norm, ticker);
    const key = normSorted(title);
    const prev = sorted.get(key);
    if (prev && prev !== ticker) ambiguous.add(key);
    else if (!prev) sorted.set(key, ticker);
  }
  for (const k of ambiguous) sorted.delete(k);
  tickerMaps = { exact, sorted };
  return tickerMaps;
}

// Abreviaturas que el 13F usa y la SEC escribe completas (o al revés).
const ABBR: Record<string, string> = {
  BK: "BANK", AMER: "AMERICA", SYS: "SYSTEMS", SYSTS: "SYSTEMS", INTL: "INTERNATIONAL",
  PHARM: "PHARMACEUTICALS", PHARMS: "PHARMACEUTICALS", RES: "RESOURCES", SVCS: "SERVICES",
  SVC: "SERVICES", FINL: "FINANCIAL", INDS: "INDUSTRIES", INDUS: "INDUSTRIES",
  MTGE: "MORTGAGE", NTL: "NATIONAL", NATL: "NATIONAL", TECHS: "TECHNOLOGIES",
  TECH: "TECHNOLOGIES", MFG: "MANUFACTURING", ENTMT: "ENTERTAINMENT", PPTYS: "PROPERTIES",
  STS: "STATES", ELEC: "ELECTRIC", PETE: "PETROLEUM", COMMUN: "COMMUNICATIONS",
  PAC: "PACIFIC", MATLS: "MATERIALS", MTLS: "MATERIALS", LABS: "LABORATORIES",
  ENRGY: "ENERGY", ENGY: "ENERGY", TRANS: "TRANSPORTATION", STHN: "SOUTHERN",
  NORTHN: "NORTHERN", AUTOMOTIVE: "AUTOMOTIVE", DEV: "DEVELOPMENT",
};

// Palabras que no distinguen a una empresa de otra.
const FILLER = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|HLDGS?|HOLDINGS?|GROUP|THE|CLASS|CL|COM|SA|NV|AG|TR|TRUST|ADR|NEW|DEL|OF|AND)\b/g;

/**
 * Normaliza un nombre de emisor para casar el 13F ("BK OF AMERICA CORP") con el
 * registro de la SEC ("BANK OF AMERICA CORP /DE/"). Quita el estado de
 * incorporación, apóstrofes, palabras de relleno y expande abreviaturas.
 */
/** El XML trae entidades: "S&amp;P GLOBAL" debe leerse "S&P GLOBAL". */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'").replace(/&#0*38;/g, "&")
    .replace(/&amp;/gi, "&"); // al final, para no re-decodificar de más
}

export function normName(s: string): string {
  const words = decodeEntities(s).toUpperCase()
    .replace(/\/[A-Z]{2}\/?(?=\s|$)/g, " ") // "/DE/", "/CA" — estado de incorporación
    .replace(/&/g, " AND ")
    .replace(/['’]/g, "")            // MACY'S → MACYS (no partir la palabra)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(FILLER, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBR[w] ?? w);
  return words.join(" ").trim();
}

/** Misma normalización pero con las palabras ordenadas: casa "HORTON D R" con "D R HORTON". */
export function normSorted(s: string): string {
  const n = normName(s);
  return n ? n.split(" ").sort().join(" ") : "";
}

// Overrides para nombres que no casan directo (se amplía según haga falta).
const OVERRIDES: Record<string, string> = {
  "ALPHABET": "GOOGL", "GOOGLE": "GOOGL", "META PLATFORMS": "META", "FACEBOOK": "META",
  "BERKSHIRE HATHAWAY": "BRK.B", "OCCIDENTAL PETE": "OXY", "OCCIDENTAL PETROLEUM": "OXY",
  "BANK AMER": "BAC", "BANK OF AMER": "BAC", "AMERICAN EXPRESS": "AXP", "COCA COLA": "KO",
  "CHEVRON": "CVX", "APPLE": "AAPL", "AMAZON": "AMZN", "AMAZON COM": "AMZN", "MICROSOFT": "MSFT",
  "NVIDIA": "NVDA", "TESLA": "TSLA", "NETFLIX": "NFLX", "CHUBB": "CB", "KRAFT HEINZ": "KHC",
  "MOODYS": "MCO", "VISA": "V", "MASTERCARD": "MA", "AON": "AON", "DAVITA": "DVA",
  "T MOBILE US": "TMUS", "T-MOBILE US": "TMUS",
};

// Los overrides se normalizan igual que el resto, así siguen casando aunque
// cambie normName (p.ej. "BANK AMER" y "BANK OF AMER" acaban en "BANK AMERICA").
const OVERRIDE_MAP = new Map(Object.entries(OVERRIDES).map(([k, v]) => [normName(k), v]));

async function tickerFor(name: string): Promise<string | null> {
  const norm = normName(name);
  const ov = OVERRIDE_MAP.get(norm);
  if (ov) return ov;
  const { exact, sorted } = await loadTickerMap();
  return exact.get(norm) ?? sorted.get(normSorted(name)) ?? null;
}

export interface Holding { name: string; cusip: string; value: number; shares: number }

// Baja y parsea las posiciones (infotable) de un reporte 13F concreto.
async function holdingsOf(cik: string, accession: string): Promise<Holding[]> {
  const acc = accession.replace(/-/g, "");
  const cikNum = String(Number(cik)); // sin ceros a la izquierda para /data/
  const idx = await sec<{ directory: { item: { name: string }[] } }>(
    `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`);
  const xml = idx.directory.item.find((i) => /\.xml$/i.test(i.name) && !/primary_doc/i.test(i.name));
  if (!xml) return [];
  const res = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${xml.name}`, { headers: UA, cache: "no-store" });
  if (!res.ok) return [];
  return parseInfoTable(await res.text());
}

/**
 * Parsea el XML de posiciones de un 13F. Agrupa por CUSIP (un mismo emisor puede
 * venir en varias filas, p.ej. por clase de acción o por gestor delegado).
 */
export function parseInfoTable(text: string): Holding[] {
  const byCusip = new Map<string, Holding>();
  // Ojo: algunos fondos usan espacio de nombres (<ns1:infoTable>), otros no.
  for (const b of text.split(/<\/?[a-z0-9]*:?infoTable[^>]*>/i)) {
    if (!/nameOfIssuer/i.test(b)) continue;
    const g = (t: string) => (b.match(new RegExp(`<[a-z0-9]*:?${t}[^>]*>([^<]*)</`, "i")) || [])[1]?.trim() ?? "";
    const cusip = g("cusip").toUpperCase();
    if (!cusip) continue;
    const cur = byCusip.get(cusip) ?? { name: decodeEntities(g("nameOfIssuer")), cusip, value: 0, shares: 0 };
    cur.value += Number(g("value")) || 0;
    cur.shares += Number(g("sshPrnamt")) || 0;
    byCusip.set(cusip, cur);
  }
  return normalizeUnits([...byCusip.values()]);
}

/**
 * El 13F debería venir en dólares enteros, pero muchos fondos siguen reportando
 * en MILES. Se detecta con el precio implícito (valor ÷ acciones): si la mediana
 * da menos de $1 por acción, el reporte viene en miles y hay que multiplicar.
 */
export function normalizeUnits(holdings: Holding[]): Holding[] {
  const prices = holdings.filter((h) => h.shares > 0 && h.value > 0).map((h) => h.value / h.shares).sort((a, b) => a - b);
  if (prices.length < 3) return holdings; // muy pocos datos para decidir
  const median = prices[Math.floor(prices.length / 2)];
  if (median >= 1) return holdings; // ya está en dólares
  for (const h of holdings) h.value *= 1000;
  return holdings;
}

/** Reporte del inversor: sus jugadas del último trimestre vs el anterior. */
export async function fetchFund(id: string): Promise<FundReport> {
  const inv = INVESTORS.find((x) => x.id === id);
  if (!inv) throw new Error("Inversor no encontrado.");
  const padded = inv.cik.padStart(10, "0");
  const sub = await sec<{ filings: { recent: { form: string[]; accessionNumber: string[]; reportDate: string[]; filingDate: string[] } } }>(
    `https://data.sec.gov/submissions/CIK${padded}.json`);
  const f = sub.filings.recent;
  const idxs: number[] = [];
  for (let i = 0; i < f.form.length && idxs.length < 2; i++) if (f.form[i] === "13F-HR") idxs.push(i);
  if (idxs.length === 0) throw new Error("Este inversor no tiene reportes 13F recientes.");

  const nowH = await holdingsOf(inv.cik, f.accessionNumber[idxs[0]]);
  const prevH = idxs[1] ? await holdingsOf(inv.cik, f.accessionNumber[idxs[1]]).catch(() => []) : [];
  const prevMap = new Map(prevH.map((h) => [h.cusip, h]));
  const totalValue = nowH.reduce((s, h) => s + h.value, 0);

  // Construir jugadas con dirección.
  const moves: Move[] = [];
  for (const h of nowH) {
    const p = prevMap.get(h.cusip);
    const prevShares = p?.shares ?? 0;
    let kind: MoveKind;
    if (!p) kind = "nueva";
    else if (h.shares > prevShares * 1.05) kind = "aumento";
    else if (h.shares < prevShares * 0.95) kind = "recorte";
    else kind = "mantiene";
    const changePct = prevShares > 0 ? ((h.shares - prevShares) / prevShares) * 100 : null;
    const direction = kind === "nueva" || kind === "aumento" ? "alcista" : kind === "recorte" ? "bajista" : "neutral";
    moves.push({
      name: h.name, ticker: await tickerFor(h.name), kind, direction,
      value: h.value, shares: h.shares, prevShares,
      pctOfPortfolio: totalValue > 0 ? (h.value / totalValue) * 100 : 0, changePct,
    });
  }
  // Salidas (estaban antes, ya no).
  const nowSet = new Set(nowH.map((h) => h.cusip));
  for (const p of prevH) {
    if (nowSet.has(p.cusip)) continue;
    moves.push({
      name: p.name, ticker: await tickerFor(p.name), kind: "salida", direction: "bajista",
      value: 0, shares: 0, prevShares: p.shares, pctOfPortfolio: 0, changePct: -100,
    });
  }

  // Fusiona las clases de una misma acción (p.ej. GOOG/GOOGL, LEN/LEN.B) en una fila.
  const merged = new Map<string, Move>();
  for (const m of moves) {
    const key = m.ticker ?? m.name;
    const e = merged.get(key);
    if (!e) { merged.set(key, { ...m }); continue; }
    e.value += m.value; e.shares += m.shares; e.prevShares += m.prevShares;
  }
  const mergedArr: Move[] = [...merged.values()].map((m) => {
    const changePct = m.prevShares > 0 ? ((m.shares - m.prevShares) / m.prevShares) * 100 : null;
    let kind: MoveKind;
    if (m.prevShares === 0 && m.shares > 0) kind = "nueva";
    else if (m.shares === 0) kind = "salida";
    else if (m.shares > m.prevShares * 1.05) kind = "aumento";
    else if (m.shares < m.prevShares * 0.95) kind = "recorte";
    else kind = "mantiene";
    const direction: Move["direction"] = kind === "nueva" || kind === "aumento" ? "alcista" : kind === "recorte" || kind === "salida" ? "bajista" : "neutral";
    return { ...m, kind, direction, changePct, pctOfPortfolio: totalValue > 0 ? (m.value / totalValue) * 100 : 0 };
  });

  // Orden: primero lo más jugoso (nuevas y aumentos grandes), luego por tamaño.
  const rank = (m: Move) => (m.kind === "nueva" ? 4 : m.kind === "aumento" ? 3 : m.kind === "salida" ? 2 : m.kind === "recorte" ? 1 : 0);
  mergedArr.sort((a, b) => rank(b) - rank(a) || b.value - a.value || (b.pctOfPortfolio - a.pctOfPortfolio));

  return {
    investor: inv.name, fund: inv.fund,
    periodNow: f.reportDate[idxs[0]], periodPrev: idxs[1] ? f.reportDate[idxs[1]] : null,
    filedNow: f.filingDate[idxs[0]], totalValue, positions: nowH.length,
    moves: mergedArr, note: inv.note,
  };
}
