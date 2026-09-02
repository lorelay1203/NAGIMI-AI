// ============================================================================
// Streamer de FLUJO en vivo de Tastytrade (DXLink/DXFeed) para Nagimi.
//
// Escucha las operaciones de opciones del vencimiento más cercano y acumula,
// por strike, quién fue el AGRESOR (quien compró al ask vs quien vendió al bid).
// Eso es lo que MarketSnack da con cookie — aquí sale de tu cuenta de Tastytrade,
// que NO caduca cada pocas horas.
//
// Además guarda una serie de tiempo del volumen, que es lo único que permite
// medir la VELOCIDAD de la cinta (si el dinero corre o está tranquilo).
//
// Escribe:  data/ttflow/<TICKER>-<fecha ET>.json
// Lo lee:   lib/ttFlow.ts  (y de ahí el filtro del ticket)
//
// Cómo se usa (con la app cerrada o abierta, da igual):
//     node streamer/tastytrade-flow.mjs
//     TICKERS="SPY,QQQ,NVDA" node streamer/tastytrade-flow.mjs
//
// Credenciales: data/tastytrade_creds.json (el mismo que ya usa la app).
// Requiere Node 22+ (WebSocket incluido). NO envía órdenes: solo escucha.
// ============================================================================

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREDS_FILE = path.join(WEB, "data", "tastytrade_creds.json");
const OUT_DIR = path.join(WEB, "data", "ttflow");

const TICKERS = (process.env.TICKERS || "SPY").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
/** Cuántos strikes alrededor del precio se escuchan por ticker. */
const WINDOW = Number(process.env.STREAM_WINDOW || 60);
/** Cada cuánto se guarda a disco. */
const WRITE_MS = 10_000;
/** Muestras de volumen que se guardan (para medir la velocidad). */
const MAX_SAMPLES = 90; // 90 × 10s = 15 min

const HDRS = { "Content-Type": "application/json", "User-Agent": "nagimi-flow/1.0", Accept: "application/json" };
const etNow = () => new Date().toLocaleTimeString("es", { timeZone: "America/New_York", hour12: false });
const etDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const log = (...a) => console.log(`[${etNow()}]`, ...a);

function creds() {
  try {
    const c = JSON.parse(readFileSync(CREDS_FILE, "utf8"));
    if (!c.refreshToken || !c.clientSecret) throw new Error("faltan campos");
    return c;
  } catch (e) {
    console.error(`\n❌ No pude leer ${CREDS_FILE}\n   ${e.message}\n   Conecta Tastytrade en la app primero.\n`);
    process.exit(1);
  }
}
const API = () => (creds().env === "sandbox" ? "https://api.cert.tastyworks.com" : "https://api.tastytrade.com");

// ------------------------------------------------------------------- REST
async function accessToken() {
  const c = creds();
  const r = await fetch(`${API()}/oauth/token`, {
    method: "POST", headers: HDRS,
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: c.refreshToken, client_secret: c.clientSecret }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`/oauth/token ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j.access_token;
}
async function quoteToken(bearer) {
  const r = await fetch(`${API()}/api-quote-tokens`, { headers: { ...HDRS, Authorization: `Bearer ${bearer}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(`/api-quote-tokens ${r.status}`);
  return { token: j.data.token, url: j.data["dxlink-url"] };
}
/** Cadena del vencimiento más cercano, con los símbolos que usa el streamer. */
async function nearChain(bearer, ticker) {
  const r = await fetch(`${API()}/option-chains/${ticker}/nested`, { headers: { ...HDRS, Authorization: `Bearer ${bearer}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(`/option-chains ${ticker} ${r.status}`);
  const today = etDate();
  const exps = (j.data?.items || []).flatMap((it) => it.expirations || [])
    .filter((e) => e["expiration-date"] && e["expiration-date"] >= today)
    .sort((a, b) => String(a["expiration-date"]).localeCompare(String(b["expiration-date"])));
  const near = exps[0];
  if (!near) throw new Error(`sin vencimientos para ${ticker}`);
  const strikes = (near.strikes || [])
    .map((s) => ({ strike: Number(s["strike-price"]), call: s["call-streamer-symbol"], put: s["put-streamer-symbol"] }))
    .filter((s) => (s.call || s.put) && Number.isFinite(s.strike))
    .sort((a, b) => a.strike - b.strike);
  return { strikes, exp: near["expiration-date"] };
}

// ------------------------------------------------------- acumulador por ticker
const books = new Map();     // ticker → Map(clave → bucket)
const samples = new Map();   // ticker → [{t, contracts}]
const spots = new Map();     // ticker → precio del subyacente
const lastTradeAt = new Map();
const seen = new Set();      // para no contar dos veces la misma operación
let day = etDate();

for (const t of TICKERS) { books.set(t, new Map()); samples.set(t, []); }

function resetIfNewDay() {
  const d = etDate();
  if (d === day) return;
  log(`Nuevo día (${day} → ${d}): empiezo de cero.`);
  for (const t of TICKERS) { books.set(t, new Map()); samples.set(t, []); }
  seen.clear();
  day = d;
}

function bucketOf(ticker, type, strike) {
  const book = books.get(ticker);
  const key = `${type}:${strike}`;
  let b = book.get(key);
  if (!b) {
    b = { strike, type, ask: 0, bid: 0, mid: 0, trades: 0, volume: 0, oi: 0,
          gamma: null, delta: null, iv: null, bidPrice: null, askPrice: null, ts: 0 };
    book.set(key, b);
  }
  return b;
}

function onOptionEvent(e, meta) {
  const b = bucketOf(meta.ticker, meta.type, meta.strike);
  const tm = Number(e.time) || 0;
  if (tm > b.ts) b.ts = tm;

  switch (e.eventType) {
    case "TimeAndSale": {
      // Cada operación llega una sola vez: se descartan repetidas.
      const key = e.index != null ? `${e.eventSymbol}:${e.index}` : `${e.eventSymbol}:${e.time}:${e.size}`;
      if (seen.has(key)) return;
      if (seen.size > 500_000) seen.clear();
      seen.add(key);

      const size = Number(e.size) || 0;
      const side = String(e.aggressorSide ?? "").trim().toLowerCase();
      // "buy" = el agresor compró (pagó el ask) · "sell" = vendió (dio el bid).
      if (side.startsWith("b")) b.ask += size;
      else if (side.startsWith("s")) b.bid += size;
      else b.mid += size;
      b.trades += 1;
      if (tm > (lastTradeAt.get(meta.ticker) ?? 0)) lastTradeAt.set(meta.ticker, tm);
      break;
    }
    case "Trade":
      if (Number.isFinite(e.dayVolume)) b.volume = Math.max(b.volume, Number(e.dayVolume));
      break;
    case "Summary":
      if (Number.isFinite(e.openInterest)) b.oi = Math.max(b.oi, Number(e.openInterest));
      break;
    case "Greeks":
      if (Number.isFinite(e.gamma)) b.gamma = e.gamma;
      if (Number.isFinite(e.delta)) b.delta = e.delta;
      if (Number.isFinite(e.volatility)) b.iv = e.volatility;
      break;
    case "Quote":
      if (Number.isFinite(e.bidPrice)) b.bidPrice = e.bidPrice;
      if (Number.isFinite(e.askPrice)) b.askPrice = e.askPrice;
      break;
  }
}

/** Guarda a disco. Escribe a un temporal y renombra, para que quien lea nunca vea medio fichero. */
function persist(ticker) {
  resetIfNewDay();
  const book = books.get(ticker);

  // Muestra de volumen acumulado, para poder medir la velocidad de la cinta.
  let contracts = 0;
  for (const b of book.values()) contracts += b.ask + b.bid + b.mid;
  const serie = samples.get(ticker);
  serie.push({ t: Date.now(), contracts });
  if (serie.length > MAX_SAMPLES) serie.splice(0, serie.length - MAX_SAMPLES);

  const obj = {
    ticker, date: day, source: "tastytrade",
    updatedAt: new Date().toISOString(),
    spot: spots.get(ticker) ?? null,
    lastTradeAt: lastTradeAt.get(ticker) ?? null,
    buckets: Object.fromEntries(book),
    samples: serie,
  };
  try { mkdirSync(OUT_DIR, { recursive: true }); } catch { /* ya existe */ }
  const file = path.join(OUT_DIR, `${ticker}-${day}.json`);
  try {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj));
    renameSync(tmp, file);
  } catch (e) {
    log(`[${ticker}] no pude guardar: ${e.message}`);
  }
}

function report(ticker) {
  const book = books.get(ticker);
  let buy = 0, sell = 0, withGreeks = 0;
  for (const b of book.values()) { buy += b.ask; sell += b.bid; if (b.gamma != null) withGreeks++; }
  const cvd = buy - sell;
  const last = lastTradeAt.get(ticker);
  const age = last ? `${Math.round((Date.now() - last) / 1000)}s` : "—";
  log(`[${ticker}] compras ${buy} · ventas ${sell} · neto ${cvd >= 0 ? "+" : ""}${cvd} · ${book.size} strikes (${withGreeks} c/griegas) · última operación hace ${age}`);
}

// ------------------------------------------------------------------ DXLink
async function connect(ticker) {
  const bearer = await accessToken();
  const { token, url } = await quoteToken(bearer);
  const chain = await nearChain(bearer, ticker);
  log(`[${ticker}] vencimiento ${chain.exp} · ${chain.strikes.length} strikes disponibles`);

  const optMeta = new Map();

  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const send = (o) => ws.send(JSON.stringify(o));
    let keepalive, writer, phase2;
    const finish = (why) => {
      clearInterval(keepalive); clearInterval(writer); clearTimeout(phase2);
      try { ws.close(); } catch { /* ya cerrado */ }
      resolve(why);
    };

    ws.addEventListener("open", () => send({
      type: "SETUP", channel: 0, version: "nagimi/1.0",
      keepaliveTimeout: 60, acceptKeepaliveTimeout: 60,
    }));

    ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }

      if (m.type === "AUTH_STATE" && m.state === "UNAUTHORIZED") return send({ type: "AUTH", channel: 0, token });
      if (m.type === "AUTH_STATE" && m.state === "AUTHORIZED") {
        keepalive = setInterval(() => send({ type: "KEEPALIVE", channel: 0 }), 25_000);
        return send({ type: "CHANNEL_REQUEST", channel: 1, service: "FEED", parameters: { contract: "AUTO" } });
      }

      if (m.type === "CHANNEL_OPENED") {
        send({ type: "FEED_SETUP", channel: 1, acceptAggregationPeriod: 0.5, acceptDataFormat: "FULL",
          acceptEventFields: {
            TimeAndSale: ["eventType", "eventSymbol", "price", "size", "aggressorSide", "time", "index"],
            Trade: ["eventType", "eventSymbol", "price", "dayVolume", "time"],
            Summary: ["eventType", "eventSymbol", "openInterest", "time"],
            Greeks: ["eventType", "eventSymbol", "gamma", "delta", "volatility", "time"],
            Quote: ["eventType", "eventSymbol", "bidPrice", "askPrice"],
          } });

        // Fase 1: el subyacente, para saber el precio y elegir los strikes cercanos.
        send({ type: "FEED_SUBSCRIPTION", channel: 1, add: [{ type: "Quote", symbol: ticker }, { type: "Trade", symbol: ticker }] });

        // Fase 2 (5 s después): ya con precio, se escuchan las opciones cercanas.
        phase2 = setTimeout(() => {
          const spot = spots.get(ticker);
          if (!spot) {
            log(`[${ticker}] no llegó el precio (¿mercado cerrado?). Sigo escuchando por si abre.`);
          } else {
            const atm = chain.strikes
              .map((s) => ({ ...s, d: Math.abs(s.strike - spot) }))
              .sort((a, b) => a.d - b.d)
              .slice(0, WINDOW);
            const subs = [];
            for (const s of atm) {
              for (const [sym, type] of [[s.call, "call"], [s.put, "put"]]) {
                if (!sym) continue;
                optMeta.set(sym, { ticker, type, strike: s.strike });
                for (const ty of ["TimeAndSale", "Trade", "Summary", "Greeks", "Quote"]) subs.push({ type: ty, symbol: sym });
              }
            }
            if (subs.length) {
              send({ type: "FEED_SUBSCRIPTION", channel: 1, add: subs });
              const lo = Math.min(...atm.map((s) => s.strike)), hi = Math.max(...atm.map((s) => s.strike));
              log(`[${ticker}] precio ${spot} → escuchando ${atm.length} strikes (${lo}–${hi}). Acumulando…`);
            }
          }
          writer = setInterval(() => { persist(ticker); report(ticker); }, WRITE_MS);
        }, 5000);
        return;
      }

      if (m.type === "FEED_DATA") {
        for (const e of m.data ?? []) {
          if (!e || typeof e !== "object") continue;
          // Evento del subyacente: solo interesa el precio.
          if (e.eventSymbol === ticker) {
            const px = Number.isFinite(e.price) ? e.price
              : Number.isFinite(e.bidPrice) && Number.isFinite(e.askPrice) ? (e.bidPrice + e.askPrice) / 2
              : null;
            if (px && px > 0) spots.set(ticker, px);
            continue;
          }
          const meta = optMeta.get(e.eventSymbol);
          if (meta) onOptionEvent(e, meta);
        }
        return;
      }

      if (m.type === "ERROR") log(`[${ticker}] error del servidor: ${m.error ?? ""} ${m.message ?? ""}`);
    });

    ws.addEventListener("close", () => finish("cerrado"));
    ws.addEventListener("error", () => finish("error"));
  });
}

/** Se reconecta solo si el socket cae (pasa: el token de cotización caduca). */
async function runTicker(ticker) {
  for (;;) {
    try {
      const why = await connect(ticker);
      log(`[${ticker}] conexión terminada (${why}). Reconecto en 5 s…`);
    } catch (e) {
      log(`[${ticker}] fallo: ${e.message}. Reintento en 15 s…`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
    persist(ticker); // no perder lo acumulado
    await new Promise((r) => setTimeout(r, 5000));
  }
}

log(`Escuchando el flujo de: ${TICKERS.join(", ")}`);
log(`Guardando en: ${OUT_DIR}`);
log("Solo LECTURA — este proceso nunca envía órdenes. Ctrl+C para parar.\n");
await Promise.all(TICKERS.map(runTicker));
