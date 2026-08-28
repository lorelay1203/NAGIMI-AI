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

export interface Investor { id: string; name: string; fund: string; cik: string; note?: string }

// Inversores famosos que SÍ reportan 13F (verificados en la SEC).
export const INVESTORS: Investor[] = [
  { id: "buffett", name: "Warren Buffett", fund: "Berkshire Hathaway", cik: "1067983" },
  { id: "burry", name: "Michael Burry", fund: "Scion Asset Management", cik: "1649339" },
  { id: "ackman", name: "Bill Ackman", fund: "Pershing Square", cik: "1336528" },
  { id: "dalio", name: "Ray Dalio", fund: "Bridgewater Associates", cik: "1350694" },
  { id: "tepper", name: "David Tepper", fund: "Appaloosa", cik: "1656456" },
  { id: "citadel", name: "Citadel (Ken Griffin)", fund: "Citadel Advisors", cik: "1423053", note: "Gran market maker: sus posiciones suelen ser coberturas, no apuestas direccionales." },
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

// Mapa nombre→ticker de la SEC (company_tickers.json), cacheado en memoria.
let tickerMap: Map<string, string> | null = null;
async function loadTickerMap(): Promise<Map<string, string>> {
  if (tickerMap) return tickerMap;
  const j = await sec<Record<string, { ticker: string; title: string }>>("https://www.sec.gov/files/company_tickers.json").catch(() => ({} as Record<string, { ticker: string; title: string }>));
  const m = new Map<string, string>();
  for (const k of Object.keys(j)) {
    const norm = normName(j[k].title);
    if (norm && !m.has(norm)) m.set(norm, j[k].ticker);
  }
  tickerMap = m;
  return m;
}

// Normaliza un nombre de emisor para casar 13F ("APPLE INC") con SEC ("Apple Inc.").
function normName(s: string): string {
  return s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|LLC|LP|HLDGS?|HOLDINGS?|GROUP|THE|CLASS|CL|COM|SA|NV|AG|TR|TRUST|ADR|NEW|DEL)\b/g, " ")
    .replace(/\s+/g, " ").trim();
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

async function tickerFor(name: string): Promise<string | null> {
  const norm = normName(name);
  if (OVERRIDES[norm]) return OVERRIDES[norm];
  const m = await loadTickerMap();
  return m.get(norm) ?? null;
}

interface Holding { name: string; cusip: string; value: number; shares: number }

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
  const text = await res.text();
  const byCusip = new Map<string, Holding>();
  for (const b of text.split(/<\/?infoTable>/i)) {
    if (!/nameOfIssuer/i.test(b)) continue;
    const g = (t: string) => (b.match(new RegExp(`<[a-z0-9]*:?${t}[^>]*>([^<]*)</`, "i")) || [])[1]?.trim() ?? "";
    const cusip = g("cusip").toUpperCase();
    if (!cusip) continue;
    const cur = byCusip.get(cusip) ?? { name: g("nameOfIssuer"), cusip, value: 0, shares: 0 };
    cur.value += Number(g("value")) || 0;
    cur.shares += Number(g("sshPrnamt")) || 0;
    byCusip.set(cusip, cur);
  }
  return [...byCusip.values()];
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
