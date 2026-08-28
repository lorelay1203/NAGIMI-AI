"use client";

// Tarjeta de Institutional Flow Intelligence — lee UNA operación como lo haría
// una mesa institucional: Flow Score, premium, notional, moneyness, delta, DTE,
// bid/ask, OI, smart money, dirección, "por qué importa" y recomendación.
// Material de estudio. Nagimi no ejecuta.

import { useMemo, useState } from "react";
import type { FlowRow } from "@/lib/flow";
import { analyzeInstitutionalFlow } from "@/lib/institutionalFlow";

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`);
const int = new Intl.NumberFormat("en-US");

const GRADE_COLOR: Record<string, string> = { "A+": "#2ec77f", A: "#4ad991", B: "#f5c451", C: "#f0a63e", D: "#ff5d52" };
const RECO_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  "HIGH CONVICTION": { bg: "rgba(46,199,127,.14)", fg: "#4ad991", border: "#2ec77f" },
  WATCH: { bg: "rgba(245,196,81,.13)", fg: "#f5c451", border: "#b8922e" },
  WAIT: { bg: "rgba(139,152,168,.12)", fg: "var(--muted)", border: "var(--border)" },
  IGNORE: { bg: "rgba(255,93,82,.12)", fg: "#ff8a82", border: "#ff5d52" },
};

/** Barra de un componente del Flow Score. */
function CompBar({ label, score, max, note }: { label: string; score: number; max: number; note: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color = pct >= 80 ? "#2ec77f" : pct >= 50 ? "#f5c451" : "#ff5d52";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", alignItems: "center" }}>
      <span style={{ fontSize: 11.5 }}>{label}</span>
      <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{score}/{max} · {note}</span>
      <div style={{ gridColumn: "1 / -1", height: 5, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

/** Bloque de lectura: etiqueta arriba, valor grande, explicación abajo. */
function Read({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: color ?? "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

export default function InstitutionalCard({ row, onClose, onPick }: { row: FlowRow; onClose?: () => void; onPick?: (t: string) => void }) {
  const a = useMemo(() => analyzeInstitutionalFlow(row), [row]);
  const [showComps, setShowComps] = useState(false);
  const reco = RECO_STYLE[a.recommendation] ?? RECO_STYLE.WAIT;
  const gradeColor = GRADE_COLOR[a.grade] ?? "var(--text)";

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            🏦 Lectura institucional · {row.underlying}{" "}
            <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13.5 }}>
              {row.type === "call" ? "CALL" : row.type === "put" ? "PUT" : "?"} ${row.strike} · {row.expiration ?? "s/f"}
            </span>
          </div>
          <div className="card-sub">Cómo leería esta operación una mesa institucional. <b>Estudio, no consejo financiero.</b></div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} title="Cerrar"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "3px 9px", cursor: "pointer", fontSize: 13 }}>✕</button>
        )}
      </div>

      {/* Flow Score + recomendación */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: gradeColor, fontVariantNumeric: "tabular-nums" }}>{a.flowScore}</span>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>/100</span>
          <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 800, color: gradeColor, border: `1px solid ${gradeColor}`, borderRadius: 999, padding: "1px 10px" }}>{a.grade}</span>
        </div>
        <div style={{ background: reco.bg, color: reco.fg, border: `1px solid ${reco.border}`, borderRadius: 999, padding: "6px 14px", fontWeight: 800, fontSize: 13, letterSpacing: ".03em" }}>
          {a.recommendation}
        </div>
        <button type="button" onClick={() => setShowComps((v) => !v)}
          style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "5px 11px", cursor: "pointer", fontSize: 12 }}>
          {showComps ? "▾ Ocultar desglose" : "▸ Ver desglose del score"}
        </button>
      </div>

      {showComps && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 13 }}>
          {a.components.map((c) => <CompBar key={c.label} {...c} />)}
        </div>
      )}

      {/* Confianza y dirección */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "11px 13px" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Smart Money Confidence</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3 }}>{a.smartMoney}%</div>
          <div style={{ height: 6, borderRadius: 999, background: "var(--panel)", overflow: "hidden", marginTop: 6 }}>
            <div style={{ width: `${a.smartMoney}%`, height: "100%", background: a.smartMoney >= 70 ? "#2ec77f" : a.smartMoney >= 45 ? "#f5c451" : "#ff5d52" }} />
          </div>
        </div>
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "11px 13px" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Dirección implícita</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{a.direction.label}</div>
          <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", marginTop: 7, border: "1px solid var(--border-soft)" }}>
            <div style={{ width: `${a.direction.bullishPct}%`, background: "#2ec77f" }} />
            <div style={{ width: `${a.direction.bearishPct}%`, background: "#ff5d52" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
            <span style={{ color: "#4ad991" }}>Alcista {a.direction.bullishPct}%</span>
            <span style={{ color: "#ff8a82" }}>Bajista {a.direction.bearishPct}%</span>
          </div>
        </div>
      </div>

      {/* Las 8 lecturas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 10 }}>
        <Read label="Premium" value={money(a.premium.value)} note={`${"⭐".repeat(a.premium.stars.count)} ${a.premium.stars.tier}`} />
        <Read label="Tamaño" value={`${int.format(a.size.contracts)} contratos`} note={`= ${int.format(a.size.shares)} acciones · Notional ≈ ${money(a.size.notional)}`} />
        <Read label="Strike / Moneyness" value={a.moneyness.label} note={a.moneyness.note}
          color={a.moneyness.label.includes("ITM") ? "#4ad991" : a.moneyness.label === "ATM" ? "#f5c451" : "var(--text)"} />
        <Read label="Delta" value={Math.abs(a.delta.value).toFixed(2)} note={a.delta.read} />
        <Read label="Vencimiento (DTE)" value={`${a.dte.value ?? "?"}d · ${a.dte.bucket}`} note={a.dte.note} />
        <Read label="Bid / Ask" value={a.bidAsk.tone === "bull" ? "Agresivo alcista" : a.bidAsk.tone === "bear" ? "Agresivo bajista" : "Sin urgencia"} note={a.bidAsk.read}
          color={a.bidAsk.tone === "bull" ? "#4ad991" : a.bidAsk.tone === "bear" ? "#ff8a82" : "var(--text)"} />
        <Read label="Open Interest" value={a.oi.newPosition ? "Nueva posición" : "Ajuste / cierre"} note={`Vol ${int.format(a.oi.volume)} vs OI ${int.format(a.oi.openInterest)} — ${a.oi.read}`}
          color={a.oi.newPosition ? "#4ad991" : "var(--text)"} />
      </div>

      {/* ¿Qué significa? en simple */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 13 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>💬 ¿Qué significa?</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>{a.plainLanguage}</div>
      </div>

      {/* Escenario: ¿compra o venta? ¿qué podría pasar? ¿qué puedes hacer TÚ? */}
      {(() => {
        const s = a.scenario;
        const c = s.bias === "alcista" ? "#12b76a" : s.bias === "bajista" ? "#f04438" : "#e0a800";
        const tag = s.move === "compra" ? "🟢 COMPRA" : s.move === "venta" ? "🔴 VENTA" : "➖ MIXTO";
        return (
          <div style={{ border: `1px solid ${c}55`, background: `${c}10`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>
              🔮 ¿Qué podría pasar? <span style={{ color: c }}>{tag} · {s.bias}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>{s.whatCouldHappen}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
              <b style={{ color: c }}>💡 ¿Qué puedes hacer tú?</b> {s.whatYouCanDo}
            </div>
            {onPick && s.move !== "mixto" && (
              <button type="button" onClick={() => onPick(row.underlying)}
                style={{ alignSelf: "flex-start", background: c, color: "#fff", border: "none", borderRadius: 8, padding: "6px 13px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                📈 Analizar {row.underlying} y ver contratos
              </button>
            )}
          </div>
        );
      })()}

      {/* ¿Por qué importa? */}
      <div style={{ border: `1px solid ${gradeColor}55`, background: `${gradeColor}10`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 9 }}>
          📌 ¿Por qué importa esta orden? <span style={{ color: gradeColor }}>Calidad: {a.whyItMatters.grade}</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {a.whyItMatters.positives.map((p) => (
            <li key={p} style={{ fontSize: 12.5 }}><span style={{ color: "#4ad991", fontWeight: 700 }}>✔</span> {p}</li>
          ))}
        </ul>
        <div style={{ fontSize: 12.5, fontWeight: 700, margin: "11px 0 4px", color: "#f5c451" }}>⚠ Falta confirmar:</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {a.whyItMatters.missing.map((m) => (
            <li key={m} style={{ fontSize: 12, color: "var(--muted)" }}>• {m}</li>
          ))}
        </ul>
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--border-soft)", fontSize: 12.5 }}>
          <b>Acción sugerida:</b> {a.whyItMatters.action}
        </div>
      </div>

      <div className="disclaimer">
        Lectura estadística del flujo, no una orden de compra. Nagimi propone · las reglas controlan · TÚ apruebas y ejecutas.
      </div>
    </section>
  );
}
