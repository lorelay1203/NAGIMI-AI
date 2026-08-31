"use client";

import { useRef, useState } from "react";
import type { AggressionScore, FlowRow } from "@/lib/flow";
import PressureCard from "../components/PressureCard";

interface StepLine { label: string; detail?: string }
interface FlowMeta {
  ticker: string; period: string; minPremium: number;
  notableCount: number; shown: number; truncated: boolean;
}
type FlowEvent =
  | { type: "step"; label: string; detail?: string }
  | { type: "done"; rows: FlowRow[]; score: AggressionScore; meta: FlowMeta }
  | { type: "error"; message: string };

const int = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const px = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeOf(ts: string): string {
  try { return new Date(ts).toLocaleTimeString("en-US", { hour12: false }); } catch { return ts; }
}
function dateOf(ts: string): string {
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; }
}
function contractLabel(r: FlowRow): string {
  const t = r.type === "call" ? "C" : r.type === "put" ? "P" : "?";
  return `${r.underlying} ${r.strike != null ? px.format(r.strike) : "?"}${t}`;
}
function aggClass(a: FlowRow["aggression"]): string {
  return a === "ask" ? "agg-ask" : a === "bid" ? "agg-bid" : a === "mid" ? "agg-mid" : "agg-unknown";
}

// Clasificación del trade (inferencia, no dato oficial):
//  - Hedge:   put comprada al ask → cobertura / protección probable.
//  - Entrada: volumen > Open Interest → posiciones NUEVAS abriéndose.
//  - Salida:  resto → cerrando posiciones existentes.
type TradeKind = "entrada" | "salida" | "hedge";
function classifyTrade(r: FlowRow): TradeKind {
  if (r.type === "put" && r.aggression === "ask") return "hedge";
  if (r.flags.exceededOI) return "entrada";
  return "salida";
}
const KIND: Record<TradeKind, { label: string; color: string; bg: string }> = {
  entrada: { label: "🟢 Entrada", color: "#2ec77f", bg: "rgba(46,199,127,0.13)" },
  salida: { label: "🔴 Salida", color: "#ff5d52", bg: "rgba(255,93,82,0.13)" },
  hedge: { label: "🟡 Hedge", color: "#f5a623", bg: "rgba(245,166,35,0.13)" },
};

function Flags({ r }: { r: FlowRow }) {
  const chips: { k: string; label: string; cls: string }[] = [];
  if (r.flags.big) chips.push({ k: "big", label: "≥$1M", cls: "chip-hot" });
  if (r.flags.convDelta) chips.push({ k: "cd", label: "Δ>.6", cls: "chip-hot" });
  if (r.flags.aboveAsk) chips.push({ k: "ask", label: "Ask", cls: "chip-ask" });
  if (r.flags.belowBid) chips.push({ k: "bid", label: "Bid", cls: "chip-bid" });
  if (r.flags.leap) chips.push({ k: "leap", label: "LEAP", cls: "chip-neutral" });
  if (r.flags.repeated) chips.push({ k: "rep", label: "repetido", cls: "chip-neutral" });
  if (r.flags.multileg) chips.push({ k: "ml", label: "multileg", cls: "chip-neutral" });
  return <span className="chips">{chips.map((c) => <span key={c.k} className={`chip ${c.cls}`}>{c.label}</span>)}</span>;
}

function ScoreCard({ score }: { score: AggressionScore }) {
  const pctAsk = score.premiumAsk + score.premiumBid > 0
    ? (100 * score.premiumAsk) / (score.premiumAsk + score.premiumBid) : 0;
  const label = score.premiumAsk + score.premiumBid === 0
    ? "Sin flujo agresivo"
    : score.ratio >= 0.66 ? "Compra agresiva (al ask)"
    : score.ratio <= 0.34 ? "Presión al bid"
    : "Mixto";
  const cls = score.ratio >= 0.66 ? "up" : score.ratio <= 0.34 ? "down" : "neutral";
  return (
    <section className="scorecard">
      <div className="score-main">
        <div className="score-cat">Agresividad</div>
        <div className={`score-num ${cls}`}>{score.score}<span className="score-den">/10</span></div>
        <div className="score-q">¿Compran al ask con fuerza?</div>
      </div>
      <div className="score-detail">
        <div className={`score-verdict ${cls}`}>{label}</div>
        <div className="split-bar">
          <div className="split-ask" style={{ width: `${pctAsk}%` }} />
          <div className="split-bid" style={{ width: `${100 - pctAsk}%` }} />
        </div>
        <div className="split-legend">
          <span><span className="dot-ask" /> Ask {money.format(score.premiumAsk)}</span>
          <span><span className="dot-bid" /> Bid {money.format(score.premiumBid)}</span>
          <span className="muted">Mid {money.format(score.premiumMid)} (descartado)</span>
          <span className="muted">· {int.format(score.n)} notables</span>
        </div>
      </div>
    </section>
  );
}

const HEADERS = ["Fecha", "Hora", "Contrato", "Tipo", "DTE", "Lado", "Precio", "Bid/Ask", "Tamaño", "Premium", "Δ", "Flags"];

export default function FlowPage() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<StepLine[]>([]);
  const [rows, setRows] = useState<FlowRow[] | null>(null);
  const [score, setScore] = useState<AggressionScore | null>(null);
  const [meta, setMeta] = useState<FlowMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t || loading) return;
    esRef.current?.close();
    setLoading(true);
    setSteps([]); setRows(null); setScore(null); setMeta(null); setError(null);

    const es = new EventSource(`/api/flow?ticker=${encodeURIComponent(t)}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as FlowEvent;
      if (data.type === "step") setSteps((p) => [...p, { label: data.label, detail: data.detail }]);
      else if (data.type === "done") { setRows(data.rows); setScore(data.score); setMeta(data.meta); setLoading(false); es.close(); }
      else if (data.type === "error") { setError(data.message); setLoading(false); es.close(); }
    };
    es.onerror = () => { setLoading(false); es.close(); };
  }

  return (
    <main className="wrap">
      <div className="header">
        <h1>Agresividad · Time &amp; Sales</h1>
        <p>Transacciones notables y score de agresividad (bid/ask) para el scorecard.</p>
      </div>

      <form className="searchbar" onSubmit={search}>
        <input value={ticker} onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker o contrato — TSLA, NVDA, SPX…" autoFocus spellCheck={false} />
        <button type="submit" disabled={loading || !ticker.trim()}>{loading ? "Buscando…" : "Buscar"}</button>
      </form>

      {steps.length > 0 && (
        <div className="steps">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={i} className={`step ${loading && isLast ? "active" : "done"}`}>
                <span className="dot" /><span>{s.label}</span>
                {s.detail && <span className="detail">{s.detail}</span>}
              </div>
            );
          })}
          {!loading && rows && <div className="step done"><span className="dot" /><span>Listo ✓</span></div>}
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      {score && <ScoreCard score={score} />}

      {rows && rows.length > 0 && <PressureCard rows={rows} />}

      {rows && meta && (
        <>
          <h2 className="section-title">
            Transacciones notables · {meta.ticker} · periodo {meta.period}
            <span className="muted"> — {int.format(meta.notableCount)} halladas{meta.shown < meta.notableCount ? `, top ${meta.shown}` : ""}</span>
          </h2>
          <div className="card-sub" style={{ marginBottom: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ color: "#2ec77f", fontWeight: 600 }}>🟢 Entrada — volumen &gt; OI (abre posición)</span>
            <span style={{ color: "#ff5d52", fontWeight: 600 }}>🔴 Salida — volumen ≤ OI (cierra)</span>
            <span style={{ color: "#f5a623", fontWeight: 600 }}>🟡 Hedge — put comprada (cobertura)</span>
            <span className="muted">· clasificación inferida, no oficial</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr>{HEADERS.map((h) => <th key={h} className={h === "Contrato" || h === "Flags" ? "left" : ""}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const km = KIND[classifyTrade(r)];
                  return (
                    <tr key={r.id} style={{ background: km.bg }}>
                      <td>{dateOf(r.timestamp)}</td>
                      <td>{timeOf(r.timestamp)}</td>
                      <td className="left" style={{ color: km.color, fontWeight: 600 }}>{contractLabel(r)}</td>
                      <td className="left">
                        <span
                          style={{
                            color: km.color,
                            border: `1px solid ${km.color}`,
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {km.label}
                        </span>
                      </td>
                      <td>{r.dte ?? "—"}</td>
                      <td><span className={`pill ${aggClass(r.aggression)}`}>{r.side}</span></td>
                      <td>{px.format(r.price)}</td>
                      <td className="muted">{px.format(r.bid)}/{px.format(r.ask)}</td>
                      <td>{int.format(r.size)}</td>
                      <td>{money.format(r.premium)}</td>
                      <td>{r.delta.toFixed(2)}</td>
                      <td className="left"><Flags r={r} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
