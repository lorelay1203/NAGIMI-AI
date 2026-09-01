"use client";

// Pestaña DAY TRADE — "la sesión de hoy": capa intradía independiente del swing.
// Diseño según la referencia de la usuaria: veredicto de sesión + 4 tarjetas score
// + niveles de la sesión + canal de gamma en vivo + dinero de hoy (prints) + ideas.
// Datos: /api/session-day (Massive 5-min DELAYED + muros de gamma). El flujo/prints
// se llena con MarketSnack (cookie); sin ella, muestra un estado limpio.

import { useCallback, useEffect, useState } from "react";
import type { DaySession, ScoreCard } from "@/lib/sessionDay";
import type { DayIdea } from "@/lib/dayTradeIdeas";
import type { MsGexResult } from "@/lib/marketsnackGex";
import type { GexHeatmap } from "@/lib/gexHeatmap";
import MarketSnackGexCard from "../components/MarketSnackGexCard";
import GexLadderCard from "../components/GexLadderCard";
import TicketCard from "../components/TicketCard";
import ChartZoom from "../components/ChartZoom";

const TICKERS: { sym: string; note?: string }[] = [
  { sym: "SPY", note: "= SPX ÷10 · espejo de /ES y /MES" },
  { sym: "SPX", note: "solo con cookie de MarketSnack" },
  { sym: "NVDA" }, { sym: "TSLA" }, { sym: "META" }, { sym: "AMD" },
  { sym: "MU" }, { sym: "AAPL" }, { sym: "AMZN" }, { sym: "GOOGL" },
  { sym: "MSFT" }, { sym: "AVGO" }, { sym: "PLTR" }, { sym: "HOOD" }, { sym: "NFLX" },
];

const money = (n: number | null): string =>
  n == null ? "—" : `$${n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(2)}`;
const scoreColor = (s: number) => (s <= 3.9 ? "#f04438" : s <= 6 ? "#e0a823" : "#12b76a");
const bigMoney = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
};

function SectionHead({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 2px", flexWrap: "wrap" }}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{icon} {title}</span>
      {sub && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>— {sub}</span>}
    </div>
  );
}

// Tarjeta con score /10 (Flujo, Agresividad, Precio vs VWAP, Canal de gamma).
function ScoreTile({ label, card }: { label: string; card: ScoreCard | null }) {
  if (!card) {
    return (
      <div style={tile}>
        <div style={tileLabel}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>⏳ Pega la cookie 🍪</div>
        <div style={tileNote}>necesita MarketSnack</div>
      </div>
    );
  }
  const c = scoreColor(card.score);
  return (
    <div style={tile}>
      <div style={tileLabel}>{label}</div>
      <div style={{ marginTop: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: c }}>{card.score.toFixed(1)}</span>
        <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>/10</span>
      </div>
      <div style={tileNote}>{card.note}</div>
    </div>
  );
}

// Tarjeta de nivel (valor grande + nota).
function InfoTile({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div style={tile}>
      <div style={tileLabel}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color ?? "var(--text)", marginTop: 2 }}>{value}</div>
      {note && <div style={tileNote}>{note}</div>}
    </div>
  );
}

const tile: React.CSSProperties = { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", minWidth: 0 };
const tileLabel: React.CSSProperties = { fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" };
const tileNote: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 };
const grid4: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const dth: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const dtd: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 12.5, whiteSpace: "nowrap" };

const biasColor = (b: DayIdea["bias"]) => (b === "alcista" ? "#12b76a" : b === "bajista" ? "#f04438" : "#7a8699");
function IdeaCard({ idea }: { idea: DayIdea }) {
  const c = biasColor(idea.bias);
  const e = idea.bias === "alcista" ? "📈" : idea.bias === "bajista" ? "📉" : "➖";
  return (
    <div style={{ background: "var(--panel-2)", border: `1px solid ${c}55`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: c }}>{e} {idea.title}</div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>conf. {idea.confidence}</span>
      </div>
      <div style={{ fontSize: 12.5 }}><b style={{ color: "var(--muted)" }}>🎯 Entrada: </b>{idea.entry}</div>
      <div style={{ fontSize: 12.5 }}><b style={{ color: "var(--muted)" }}>✅ Objetivo: </b>{idea.target}</div>
      <div style={{ fontSize: 12.5 }}><b style={{ color: "var(--muted)" }}>🛑 Stop-loss: </b>{idea.stop}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border-soft)", paddingTop: 6 }}>
        <b style={{ color: "var(--text)" }}>Por qué:</b> {idea.why}
      </div>
    </div>
  );
}

export default function DayTradesPage() {
  const [ticker, setTicker] = useState("SPY");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ session: DaySession; ideas: DayIdea[] } | null>(null);
  const [msGex, setMsGex] = useState<MsGexResult | null>(null); // gráfica estilo MarketSnack
  const [heat, setHeat] = useState<GexHeatmap | null>(null);     // perfil de barras por strike
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goSearch = () => {
    const t = query.trim().toUpperCase();
    if (t) { setTicker(t); setQuery(""); }
  };

  const load = useCallback(async (t: string) => {
    setLoading(true); setError(null); setData(null); setMsGex(null); setHeat(null);
    // La gráfica de MarketSnack y el perfil por strike se piden en paralelo.
    fetch(`/api/gex?ticker=${encodeURIComponent(t)}`).then((x) => x.json())
      .then((r) => { if (!r.error && r.latest) setMsGex(r); })
      .catch(() => {});
    fetch(`/api/mschain?ticker=${encodeURIComponent(t)}`).then((x) => x.json())
      .then((r) => { if (!r.error && Array.isArray(r.strikes) && r.strikes.length) setHeat(r); })
      .catch(() => {});
    try {
      const r = await fetch(`/api/session-day?ticker=${encodeURIComponent(t)}`).then((x) => x.json());
      if (r.error) setError(r.error); else setData(r);
    } catch { setError("No se pudo cargar. Revisa tu conexión."); }
    setLoading(false);
  }, []);
  useEffect(() => { load(ticker); }, [ticker, load]);

  const s = data?.session;
  const verdict = s
    ? s.bias === "alcista" ? { label: "SESIÓN ALCISTA", bg: "rgba(18,183,106,.12)", bd: "#12b76a55", c: "#12b76a" }
      : s.bias === "bajista" ? { label: "SESIÓN BAJISTA", bg: "rgba(240,68,56,.12)", bd: "#f0443855", c: "#ff6b6b" }
        : { label: "SESIÓN NEUTRAL", bg: "rgba(224,168,35,.12)", bd: "#e0a82355", c: "#e0a823" }
    : null;

  return (
    <main className="wrap page-stack" style={{ maxWidth: 900 }}>
      <div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 23 }}>⚡ Day Trade — la sesión de hoy</h1>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: "#fff", background: "var(--brand-grad)", borderRadius: 999, padding: "3px 10px" }}>INTRADÍA</span>
        </div>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5, fontSize: 13 }}>
          Capa <b>independiente</b> del análisis de swing: aquí <b>solo</b> cuenta la sesión{s ? ` (${s.sessionDate})` : ""} — las velas de 5 min
          y los muros de gamma. <b>SPY = espejo de /ES y /MES</b>. Los datos de Massive vienen con un retraso.
        </p>
      </div>

      {/* Buscador: cualquier ticker con opciones */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") goSearch(); }}
          placeholder="Escribe un ticker (ej. GOOGL, COIN, SOFI…)"
          spellCheck={false}
          style={{ flex: 1, minWidth: 200, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", padding: "10px 13px", fontSize: 14, fontWeight: 700, letterSpacing: ".02em" }}
        />
        <button type="button" onClick={goSearch}
          style={{ background: "var(--brand-grad)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Ver
        </button>
      </div>

      {/* Accesos rápidos */}
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Rápidos</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TICKERS.map((t) => (
            <button key={t.sym} type="button" onClick={() => setTicker(t.sym)} title={t.note}
              style={{ padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: ticker === t.sym ? "none" : "1px solid var(--border)",
                background: ticker === t.sym ? "var(--brand-grad)" : "var(--panel)",
                color: ticker === t.sym ? "#fff" : "var(--text)" }}>
              {t.sym}
            </button>
          ))}
        </div>
      </div>

      {/* Ticker activo si no está en los rápidos */}
      {!TICKERS.some((t) => t.sym === ticker) && (
        <div style={{ fontSize: 13, color: "var(--text)" }}>
          Mostrando: <b style={{ color: "var(--accent)" }}>{ticker}</b>
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>Cargando la sesión de {ticker}…</div>}

      {error && !loading && (
        <div className="card" style={{ border: "1px solid #f0443855" }}>
          <div style={{ fontWeight: 700, color: "#ff8a82", marginBottom: 4 }}>No se pudo cargar {ticker}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{error}</div>
          {ticker === "SPX" && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>💡 SPX directo necesita la cookie de MarketSnack. Mientras, usa <b>SPY</b> (es lo mismo ÷10).</div>}
        </div>
      )}

      {s && verdict && !loading && (
        <>
          {/* Veredicto de la sesión */}
          <div style={{ background: verdict.bg, border: `1px solid ${verdict.bd}`, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: verdict.c }}>{s.score.toFixed(1)}</span>
              <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 700 }}>/10</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: verdict.c, whiteSpace: "nowrap" }}>{verdict.label}</div>
            <div style={{ fontSize: 13, color: "var(--text)", flex: 1, minWidth: 220, lineHeight: 1.45 }}>{s.regimeNote}</div>
          </div>

          {/* Ticket: la idea traducida a un contrato concreto */}
          <TicketCard ticker={ticker} />

          {/* 4 tarjetas score */}
          <div style={grid4}>
            <ScoreTile label="Flujo de hoy" card={s.flow} />
            <ScoreTile label="Agresividad" card={s.aggression} />
            <ScoreTile label="Precio vs VWAP" card={s.vwapCard} />
            <ScoreTile label="Canal de gamma" card={s.channelCard} />
          </div>

          {/* Niveles de la sesión */}
          <div>
            <SectionHead icon="📍" title="Niveles de la sesión" sub="los precios de referencia del día" />
            <div style={grid4}>
              <InfoTile label="VWAP" value={money(s.vwap)} color="var(--accent)"
                note={s.vwapDelta == null ? undefined : `precio ${s.vwapDelta >= 0 ? "por encima" : "por debajo"} (${s.vwapDelta >= 0 ? "+" : ""}${s.vwapDelta.toFixed(2)})`} />
              <InfoTile label="Rango de apertura · 30 min"
                value={s.openRangeLow != null ? `${money(s.openRangeLow)} – ${money(s.openRangeHigh)}` : "—"} note="cerrado" />
              <InfoTile label="Máximo / mínimo de hoy"
                value={s.dayHigh != null ? `${money(s.dayLow)} – ${money(s.dayHigh)}` : "—"}
                note={s.rangePct != null ? `recorrido ${s.rangePct.toFixed(2)}%${s.atrPct != null ? ` · ATR ${s.atrPct.toFixed(2)}%` : ""}` : undefined} />
              <InfoTile label="Apertura / cierre previo" value={money(s.open)}
                note={s.prevClose != null ? `cierre previo ${money(s.prevClose)}` : undefined} />
            </div>
          </div>

          {/* Gráfica de GEX estilo MarketSnack (precio + muros e imán) */}
          {msGex && <ChartZoom label="GEX en vivo — precio, muros e imán"><MarketSnackGexCard data={msGex} /></ChartZoom>}

          {/* Escalera de gamma por strike (horizontal, tipo MarketSnack) */}
          {heat && <ChartZoom label="Escalera de gamma por strike"><GexLadderCard h={heat} callWall={s.callWall} putWall={s.putWall} magnet={s.magnet} /></ChartZoom>}

          {/* Canal de gamma en vivo */}
          <div>
            <SectionHead icon="🐍" title="Canal de gamma en vivo" sub="dónde el dealer frena o acelera hoy" />
            <div style={grid4}>
              <InfoTile label="Muro de calls (techo)" value={money(s.callWall)} color="#12b76a"
                note={s.callWallDeltaPct != null ? `${s.callWallDeltaPct >= 0 ? "+" : ""}${s.callWallDeltaPct.toFixed(2)}% desde aquí` : undefined} />
              <InfoTile label="Imán del día" value={money(s.magnet)} color="var(--accent)" note="hacia donde tiende a gravitar" />
              <InfoTile label="Muro de puts (suelo)" value={money(s.putWall)} color="#f04438"
                note={s.putWallDeltaPct != null ? `${s.putWallDeltaPct >= 0 ? "+" : ""}${s.putWallDeltaPct.toFixed(2)}% desde aquí` : undefined} />
              <InfoTile label="Posición en el canal"
                value={s.channelPct != null ? `${Math.round(s.channelPct)}%` : "—"}
                color={s.channelPct == null ? undefined : s.channelPct <= 25 ? "#f04438" : s.channelPct >= 75 ? "#12b76a" : "var(--text)"}
                note={s.channelPct == null ? undefined : s.channelPct <= 25 ? "pegado al muro de puts" : s.channelPct >= 75 ? "pegado al muro de calls" : "en medio del canal"} />
            </div>
          </div>

          {/* Dinero de hoy (prints) — flujo real de MarketSnack */}
          <div>
            <SectionHead icon="💰" title="Dinero de hoy"
              sub={s.prints ? `${s.prints.count} prints · ${bigMoney(s.prints.premiumTotal)} en prima` : "las apuestas grandes por strike de hoy"} />
            {s.prints && s.prints.byStrike.length > 0 ? (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
                    <thead><tr>
                      <th style={dth}>Strike</th>
                      <th style={{ ...dth, textAlign: "right" }}>Dinero</th>
                      <th style={{ ...dth, textAlign: "right" }}>En calls</th>
                      <th style={{ ...dth, textAlign: "right" }}>En puts</th>
                      <th style={{ ...dth, textAlign: "right" }}>Lado</th>
                    </tr></thead>
                    <tbody>
                      {s.prints.byStrike.map((p) => (
                        <tr key={p.strike} style={{ borderTop: "1px solid var(--border-soft)" }}>
                          <td style={{ ...dtd, fontWeight: 800 }}>${money(p.strike)}</td>
                          <td style={{ ...dtd, textAlign: "right", fontWeight: 700 }}>{bigMoney(p.total)}</td>
                          <td style={{ ...dtd, textAlign: "right", color: p.call > 0 ? "#12b76a" : "var(--muted)" }}>{p.call > 0 ? bigMoney(p.call) : "$0"}</td>
                          <td style={{ ...dtd, textAlign: "right", color: p.put > 0 ? "#f04438" : "var(--muted)" }}>{p.put > 0 ? bigMoney(p.put) : "$0"}</td>
                          <td style={{ ...dtd, textAlign: "right" }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: p.side === "PUTS" ? "#f04438" : "#12b76a", border: `1px solid ${p.side === "PUTS" ? "#f04438" : "#12b76a"}55`, borderRadius: 5, padding: "1px 6px" }}>{p.side}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Sin prints grandes en la sesión todavía. Si acabas de conectar la cookie, dale unos segundos y recarga.
              </div>
            )}
          </div>

          {/* Ideas */}
          <div>
            <SectionHead icon="💡" title="Ideas de la sesión" sub="arma la orden con vencimiento de mañana (1DTE), con stop-loss" />
            {data!.ideas.length === 0 ? (
              <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>Sin ideas claras ahora. Espera a que el precio se acerque a un muro.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data!.ideas.map((idea, i) => <IdeaCard key={i} idea={idea} />)}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
            fuente muros: {s.gexSource === "massive" ? "Massive" : s.gexSource === "schwab" ? "Schwab" : "MarketSnack"} · velas: Massive 5 min (con retraso)
          </div>
        </>
      )}

      <div className="disclaimer">
        Capa intradía con fines de estudio. Los day-trades 0DTE son de alto riesgo. No es consejo financiero.
        Arma la orden en tu bróker y usa siempre el stop-loss.
      </div>
    </main>
  );
}
