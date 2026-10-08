"use client";

// 🎯 Venta de Prima 0DTE — spreads de crédito con riesgo topado, en índices.
//
// Antes esto solo se podía ver pegando la URL de la API a mano. Es el motor
// que ya probamos contra SPX/SPY/QQQ en vivo: cobra al bid, compra al ask
// (nunca precio medio), solo mira strikes más allá de los muros de gamma, y
// avisa ANTES de los números si el régimen o la esperanza van en contra.

import { useCallback, useEffect, useState } from "react";
import { GUIA } from "@/lib/strategyGuide";
import type { CreditPlan, SpreadCandidate } from "@/lib/creditSpread0dte";
import type { InfoEspejo } from "@/lib/nivelesEspejo";
import type { ResultadoReglas } from "@/lib/reglasOro";
import ReglasOroBox from "../components/ReglasOroBox";

const TICKERS = [
  { sym: "SPX", note: "índice — sin comisión, no asignable" },
  { sym: "SPY", note: "= SPX ÷10 · usa los muros del SPX" },
  { sym: "QQQ", note: "Nasdaq 100 · usa los muros del NDX" },
];

interface PrimaResponse extends CreditPlan {
  expiration: string;
  chainSource: string;
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  asOf?: string;
  /** Precio que traían los niveles (velas de 5 min) — solo referencia. */
  spotNiveles?: number;
  /** De dónde salió `spot`: de las opciones en vivo o de los niveles. */
  spotFuente?: "cadena" | "niveles";
  desfasePct?: number | null;
  espejo?: InfoEspejo | null;
  avisoEspejo?: string | null;
  reglasOro?: ResultadoReglas;
  /** El que Nagimi propone: el mejor que cabe y sin precio viejo. */
  mejor?: SpreadCandidate | null;
}

/** Una fila de "tus alternativas hoy" (/api/prima/alternativas). */
interface Alternativa {
  ticker: string;
  error: string | null;
  espejoDe: string | null;
  regimen: "positive" | "negative" | null;
  mejor: SpreadCandidate | null;
  sinPrecios: boolean;
  caben: number;
  menorRiesgo: number | null;
  veredicto: "verde" | "amarillo" | "rojo" | null;
  resumen: string | null;
}

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const px = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 });

export default function PrimaPage() {
  const [ticker, setTicker] = useState("SPX");
  const [capital, setCapital] = useState<number | null>(null);
  const [saldoFuente, setSaldoFuente] = useState<"real" | "manual">("manual");
  const [data, setData] = useState<PrimaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En SPY/QQQ: true = usar los muros propios del ETF en vez de los del índice.
  const [propios, setPropios] = useState(false);
  const [alts, setAlts] = useState<Alternativa[] | null>(null);
  const [altsCargando, setAltsCargando] = useState(false);

  // Dinero real de los brókers conectados. Manda sobre lo escrito a mano.
  useEffect(() => {
    fetch("/api/balances").then((r) => r.json())
      .then((r: { total?: number }) => {
        if (r.total && r.total > 0) { setCapital(Math.round(r.total * 100) / 100); setSaldoFuente("real"); }
        else setCapital(100);
      })
      .catch(() => setCapital(100));
  }, []);

  const buscar = useCallback((t: string, cap: number, prop: boolean) => {
    setLoading(true); setError(null);
    fetch(`/api/prima?ticker=${encodeURIComponent(t)}&capital=${cap}${prop ? "&muros=propios" : ""}`)
      .then((r) => r.json())
      .then((r: PrimaResponse & { error?: string }) => {
        if (r.error) { setError(r.error); setData(null); }
        else setData(r);
      })
      .catch(() => setError("No se pudo conectar con Nagimi."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (capital != null) buscar(ticker, capital, propios);
  }, [ticker, capital, propios, buscar]);

  // Las tres alternativas a la vez (SPX, SPY, QQQ), para comparar.
  const buscarAlts = useCallback((cap: number) => {
    setAltsCargando(true);
    fetch(`/api/prima/alternativas?capital=${cap}`)
      .then((r) => r.json())
      .then((r: { filas?: Alternativa[] }) => setAlts(r.filas ?? null))
      .catch(() => setAlts(null))
      .finally(() => setAltsCargando(false));
  }, []);
  useEffect(() => {
    if (capital != null && capital > 0) buscarAlts(capital);
  }, [capital, buscarAlts]);

  const tieneEspejo = ticker === "SPY" || ticker === "QQQ";
  const indice = ticker === "QQQ" ? "NDX" : "SPX";

  const gCall = GUIA.call_credit;
  const gPut = GUIA.put_credit;

  return (
    <main className="wrap page-stack" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div className="eyebrow">Ventas con techo de pérdida que se acaban hoy</div>
        <h1>🎯 Venta de Prima</h1>
        <p>
          Cobras por adelantado y ganas si el precio NO llega a cierto nivel antes del cierre.
          El riesgo queda topado por la pata que compras — nunca puedes perder más de lo que
          arriesga el spread.
        </p>
      </div>

      {/* Selector de ticker */}
      <div className="card" style={{ gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TICKERS.map((t) => (
            <button key={t.sym} type="button" onClick={() => setTicker(t.sym)}
              style={{
                flex: 1, minWidth: 140, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                border: ticker === t.sym ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: ticker === t.sym ? "rgba(201,162,39,0.10)" : "transparent", color: "var(--text)",
              }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.sym}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.note}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
          <span>Capital disponible:</span>
          <input
            type="number"
            value={capital ?? ""}
            onChange={(e) => { setCapital(Number(e.target.value) || 0); setSaldoFuente("manual"); }}
            style={{ width: 100, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "4px 8px", fontSize: 13 }}
          />
          <span style={{ color: saldoFuente === "real" ? "var(--green)" : "var(--muted)" }}>
            {saldoFuente === "real" ? "✓ saldo real de tus brókers" : "escrito a mano"}
          </span>
          <button type="button" onClick={() => { if (capital != null) { buscar(ticker, capital, propios); buscarAlts(capital); } }}
            style={{ marginLeft: "auto", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            ↻ Volver a mirar
          </button>
        </div>
      </div>

      {/* Tus alternativas hoy: SPX, SPY y QQQ lado a lado */}
      <Alternativas filas={alts} cargando={altsCargando} actual={ticker} onVer={(t) => { setPropios(false); setTicker(t); }} />

      {tieneEspejo && (
        <div className="tk-espejo">
          {data?.espejo ? (
            <span>
              🪞 Muros del <b>{data.espejo.indice}</b> pasados a {ticker}
              {data.espejo.original.magnet != null && data.magnet != null && (
                <> · imán {px(data.espejo.original.magnet)} → <b>{px(data.magnet)}</b></>
              )}
              {data.espejo.origen === "cierre" && <span style={{ color: "var(--muted)" }}> (con la proporción del último cierre: un precio venía atrasado)</span>}
            </span>
          ) : (
            <span>{propios ? `Usando los muros propios de ${ticker}.` : (data?.avisoEspejo ?? "")}</span>
          )}
          <button type="button" className="tk-espejo-btn" onClick={() => setPropios((x) => !x)} disabled={loading}>
            {propios ? `Usar muros del ${indice}` : `Usar muros propios de ${ticker}`}
          </button>
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>Escaneando la cadena de {ticker}…</div>}
      {error && !loading && (
        <div className="card" style={{ border: "1px solid #f0443855" }}>
          <div style={{ color: "#ff8a82", fontWeight: 700 }}>No se pudo armar el plan</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{error}</div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Niveles del día */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
            <Tile
              label="Precio"
              value={`$${px(data.spot)}`}
              sub={data.spotFuente === "cadena" ? "de las opciones en vivo" : "de los niveles (5 min)"}
            />
            <Tile label="Muro puts" value={data.putWall != null ? `$${px(data.putWall)}` : "—"} sub="suelo" />
            <Tile label="Muro calls" value={data.callWall != null ? `$${px(data.callWall)}` : "—"} sub="techo" />
            <Tile label="Imán" value={data.magnet != null ? `$${px(data.magnet)}` : "—"} />
            <Tile
              label="Régimen"
              value={data.regimen === "positive" ? "Positiva" : "Negativa"}
              color={data.regimen === "positive" ? "var(--green)" : "var(--red-soft)"}
              sub={data.regimen === "positive" ? "tiende a frenar" : "tiende a acelerar"}
            />
          </div>

          {/* Aviso honesto — se lee ANTES que cualquier número */}
          {data.aviso && (
            <div style={{
              fontSize: 13, lineHeight: 1.55, color: "var(--amber-text)",
              background: "var(--amber-bg)", border: "1px solid var(--amber-border)",
              borderRadius: 10, padding: "12px 14px",
            }}>
              ⚠️ {data.aviso}
            </div>
          )}

          {/* Lo que Nagimi propone, en palabras */}
          {data.mejor && <Propuesta c={data.mejor} ticker={ticker} expiration={data.expiration} />}

          {data.reglasOro && <ReglasOroBox r={data.reglasOro} />}

          {/* Candidatos */}
          {data.candidatos.length > 0 ? (
            <div className="card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={th}>Lado</th>
                      <th style={th}>Vendes</th>
                      <th style={th}>Compras</th>
                      <th style={{ ...th, textAlign: "right" }}>Cobras</th>
                      <th style={{ ...th, textAlign: "right" }}>Arriesgas</th>
                      <th style={{ ...th, textAlign: "right" }}>Retorno</th>
                      <th style={{ ...th, textAlign: "right" }}>% éxito</th>
                      <th style={{ ...th, textAlign: "right" }}>Ganancia esperada</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidatos.map((c, i) => <Fila key={i} c={c} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
              Ningún spread pasó el filtro hoy en {ticker}. Vuelve a mirar más tarde — la prima cambia con el tiempo y el movimiento del precio.
            </div>
          )}

          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            Cadena {ticker} · vence {data.expiration} · fuente {data.chainSource === "marketsnack" ? "MarketSnack" : "Schwab"}
            {data.asOf && ` · niveles de las ${new Date(data.asOf).toLocaleTimeString("es-PR", { hour: "2-digit", minute: "2-digit" })}`}
            {data.spotFuente === "cadena" && data.spotNiveles != null && data.desfasePct != null &&
              ` · precio real $${px(data.spot)} vs niveles $${px(data.spotNiveles)} (${data.desfasePct >= 0 ? "+" : ""}${data.desfasePct.toFixed(2)}%)`}
          </div>
        </>
      )}

      {/* Chuleta: cómo funciona cada lado, en el mismo lenguaje que el resto de Nagimi */}
      <div className="card" style={{ gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>¿Cómo funciona esto?</div>
        <Explica g={gPut} />
        <Explica g={gCall} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
          <b>Ganancia esperada</b> = (probabilidad de éxito × lo que cobras) − (probabilidad de fallo × lo que arriesgas).
          Es lo que ganarías EN PROMEDIO si repitieras el mismo spread muchas veces. Si sale negativa, esa operación
          te desangra a la larga aunque acierte la mayoría de las veces — que es justo lo que le pasa a un spread
          demasiado cerca del precio: cobra poco, casi siempre gana, pero cuando falla pierde mucho más de lo que sumó.
        </div>
      </div>

      <div className="disclaimer">
        0DTE se mueve rapidísimo: estos números cambian minuto a minuto. Material de estudio, no consejo financiero.
        Nagimi prepara, tú decides y colocas la orden en tu bróker.
      </div>
    </main>
  );
}

/** El spread que Nagimi propone, explicado como una orden. */
function Propuesta({ c, ticker, expiration }: { c: SpreadCandidate; ticker: string; expiration: string }) {
  const call = c.lado === "call";
  const tipo = call ? "CALL" : "PUT";
  return (
    <div className="card prima-prop">
      <div className="prima-prop-head">
        <span className="tk-badge up">PROPUESTA</span>
        <span className="prima-prop-titulo">{call ? "Call" : "Put"} credit spread · {ticker} · vence {expiration}</span>
      </div>
      <div className="prima-prop-orden">
        <div>1️⃣ <b>Vende</b> el {ticker} <b>{px(c.vender)} {tipo}</b> <span className="prima-gris">(cobras)</span></div>
        <div>2️⃣ <b>Compra</b> el {ticker} <b>{px(c.comprar)} {tipo}</b> <span className="prima-gris">(tu seguro: topa la pérdida)</span></div>
      </div>
      <div className="tk-cajas">
        <div className="tk-caja">
          <div className="tk-caja-label">Cobras hoy</div>
          <div className="tk-caja-valor" style={{ color: "var(--green)" }}>{money(c.credito)}</div>
          <div className="tk-caja-sub">por contrato · es tu ganancia máxima</div>
        </div>
        <div className="tk-caja">
          <div className="tk-caja-label">Lo más que pierdes</div>
          <div className="tk-caja-valor" style={{ color: "var(--red-soft)" }}>{money(c.riesgoMax)}</div>
          <div className="tk-caja-sub">el bróker te lo aparta mientras esté abierto</div>
        </div>
        <div className="tk-caja">
          <div className="tk-caja-label">Prob. de ganar</div>
          <div className="tk-caja-valor">{c.popPct != null ? `${Math.round(c.popPct)}%` : "—"}</div>
          <div className="tk-caja-sub">
            {c.esperanza != null ? (c.esperanza >= 0 ? `a la larga +${money(c.esperanza)} por vez` : `a la larga −${money(c.esperanza)} por vez`) : ""}
          </div>
        </div>
      </div>
      <div className="prima-gris" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Ganas todo lo cobrado si {ticker} cierra hoy {call ? "por DEBAJO" : "por ENCIMA"} de {px(c.vender)}.
        {" "}Pon la orden como <b>límite</b> por {money(c.credito / 100)} de crédito (no a mercado).
        {c.trasElMuro ? " Está más allá del muro: el precio tendría que romperlo para hacerte daño." : " ⚠️ Está DENTRO del rango de los muros."}
      </div>
    </div>
  );
}

/** "¿Qué puedo hacer hoy?": la mejor opción de cada índice, lado a lado. */
function Alternativas({ filas, cargando, actual, onVer }: {
  filas: Alternativa[] | null; cargando: boolean; actual: string; onVer: (t: string) => void;
}) {
  if (!filas && !cargando) return null;
  const sem = (v: Alternativa["veredicto"]) => (v === "verde" ? "🟢" : v === "amarillo" ? "🟡" : v === "rojo" ? "🔴" : "▫️");
  return (
    <div className="card prima-alts">
      <div style={{ fontWeight: 700, fontSize: 14 }}>🧭 Tus alternativas hoy</div>
      <div className="prima-gris" style={{ fontSize: 12.5 }}>
        La misma búsqueda en los tres, con tu dinero. Toca uno para ver el detalle.
      </div>
      {cargando && !filas && <div className="prima-gris" style={{ fontSize: 13 }}>Comparando SPX, SPY y QQQ…</div>}
      {filas && (
        <div className="prima-alts-lista">
          {filas.map((f) => (
            <button key={f.ticker} type="button" onClick={() => onVer(f.ticker)}
              className={`prima-alt ${f.ticker === actual ? "activa" : ""}`}>
              <div className="prima-alt-top">
                <b>{f.ticker}</b>
                {f.espejoDe && <span className="prima-gris"> · muros del {f.espejoDe}</span>}
                <span style={{ marginLeft: "auto" }}>{sem(f.veredicto)}</span>
              </div>
              <div className="prima-alt-cuerpo">
                {f.error ? <span style={{ color: "var(--red-soft)" }}>{f.error}</span>
                  : f.mejor ? (
                    <>
                      Vende {px(f.mejor.vender)} / compra {px(f.mejor.comprar)} {f.mejor.lado === "call" ? "CALL" : "PUT"}
                      <br />cobras <b style={{ color: "var(--green)" }}>{money(f.mejor.credito)}</b> · arriesgas <b>{money(f.mejor.riesgoMax)}</b>
                      {f.mejor.popPct != null && <> · ≈{Math.round(f.mejor.popPct)}% gana</>}
                    </>
                  ) : f.sinPrecios
                    ? <>Las opciones todavía no tienen precio (abren 9:30 AM NY).</>
                  : f.menorRiesgo != null
                    ? <>Ninguno cabe: el más chico arriesga {money(f.menorRiesgo)}.</>
                    : <>Ningún spread paga lo suficiente ahora.</>}
              </div>
              {f.resumen && <div className="prima-alt-pie">{f.resumen}</div>}
            </button>
          ))}
        </div>
      )}
      <div className="prima-gris" style={{ fontSize: 12.5 }}>
        ¿Prefieres <b>comprar</b> en vez de vender? Mira el <a href={`/daytrades?ticker=${actual === "SPX" ? "SPY" : actual}`}>Ticket del día</a> — la vuelta al imán con los mismos muros.
      </div>
    </div>
  );
}

function Fila({ c }: { c: SpreadCandidate }) {
  // Un sospechoso sale "ganando", pero casi siempre es un precio viejo: nunca en verde.
  const evColor = c.esperanza == null ? "var(--muted)"
    : c.sospechoso ? "var(--amber-text)"
    : c.esperanza >= 0 ? "var(--green)" : "var(--red-soft)";
  return (
    <tr style={{ borderTop: "1px solid var(--border-soft)", opacity: c.cabe && !c.sospechoso ? 1 : 0.55 }}>
      <td style={{ ...td, fontWeight: 700, color: c.lado === "put" ? "var(--call)" : "var(--put)" }}>
        {c.lado === "put" ? "PUT" : "CALL"}
      </td>
      <td style={{ ...td, fontWeight: 700 }}>{px(c.vender)}</td>
      <td style={td}>{px(c.comprar)}</td>
      <td style={{ ...td, textAlign: "right", color: "var(--green)", fontWeight: 700 }}>{money(c.credito)}</td>
      <td style={{ ...td, textAlign: "right" }}>{money(c.riesgoMax)}</td>
      <td style={{ ...td, textAlign: "right" }}>{c.retornoPct.toFixed(1)}%</td>
      <td style={{ ...td, textAlign: "right" }}>{c.popPct != null ? `${c.popPct.toFixed(1)}%` : "—"}</td>
      <td style={{ ...td, textAlign: "right", color: evColor, fontWeight: 700 }}>
        {c.esperanza != null ? `${c.esperanza >= 0 ? "+" : "−"}${money(c.esperanza)}` : "—"}
      </td>
      <td style={{ ...td, fontSize: 11, color: "var(--muted)" }}>
        {c.sospechoso
          ? <span style={{ color: "var(--amber-text)", fontWeight: 700 }}>⚠ precio viejo — confirma en tu bróker</span>
          : !c.cabe ? `faltan ${money(c.faltan)}` : c.trasElMuro ? "tras el muro" : ""}
      </td>
    </tr>
  );
}

function Explica({ g }: { g: (typeof GUIA)[keyof typeof GUIA] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{g.nombre} <span style={{ color: "var(--muted)", fontWeight: 400 }}>— {g.apuesta}</span></div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{g.comoFunciona}</div>
      <div style={{ fontSize: 12, color: "var(--red-soft)" }}>⚠ {g.riesgo}</div>
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "9px 10px", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 12.5, whiteSpace: "nowrap" };
