"use client";

/**
 * Tarjeta "Presión del mercado": traduce a lenguaje simple lo que en MarketSnack
 * se ve como premium por lado del libro (Bid/Mid/Ask) y reparto Calls/Puts.
 */
import { analyzeMarketPressure } from "@/lib/marketPressure";
import type { FlowRow } from "@/lib/flow";

function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
const share = (part: number, total: number) => (total > 0 ? Math.round((100 * part) / total) : 0);

/** Barra de dos colores con etiquetas a los lados. */
function SplitBar({ left, right, leftLabel, rightLabel, leftColor, rightColor }: {
  left: number; right: number; leftLabel: string; rightLabel: string; leftColor: string; rightColor: string;
}) {
  const total = left + right;
  const lp = share(left, total);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span style={{ color: leftColor, fontWeight: 700 }}>{leftLabel} {money(left)} · {lp}%</span>
        <span style={{ color: rightColor, fontWeight: 700 }}>{rightLabel} {money(right)} · {100 - lp}%</span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--panel-2)" }}>
        <div style={{ width: `${lp}%`, background: leftColor }} />
        <div style={{ width: `${100 - lp}%`, background: rightColor }} />
      </div>
    </div>
  );
}

export default function PressureCard({ rows }: { rows: FlowRow[] }) {
  const p = analyzeMarketPressure(rows);
  if (p.side.total <= 0) return null;

  const c = p.bias === "alcista" ? "#12b76a" : p.bias === "bajista" ? "#f04438" : "#e0a800";
  const emoji = p.bias === "alcista" ? "🟢" : p.bias === "bajista" ? "🔴" : "🟡";
  const cells: Array<{ label: string; value: number; bull: boolean }> = [
    { label: "Compraron calls", value: p.cross.callsBought, bull: true },
    { label: "Vendieron puts", value: p.cross.putsSold, bull: true },
    { label: "Vendieron calls", value: p.cross.callsSold, bull: false },
    { label: "Compraron puts", value: p.cross.putsBought, bull: false },
  ];

  return (
    <section className="card" style={{ gap: 13, border: `1px solid ${c}55`, background: `${c}0d` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>⚖️ Presión del mercado</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: c }}>{emoji} {p.headline}</div>
      </div>

      {/* Los dos repartos que se ven en MarketSnack */}
      <div style={{ display: "grid", gap: 11 }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
            Cómo se ejecutó (quién fue agresivo)
          </div>
          <SplitBar left={p.side.ask} right={p.side.bid} leftLabel="Compraron (ask)" rightLabel="Vendieron (bid)"
            leftColor="#12b76a" rightColor="#f04438" />
          {p.side.mid > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              En el medio (sin agresividad): {money(p.side.mid)} · {share(p.side.mid, p.side.total)}%
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Calls vs Puts</div>
          <SplitBar left={p.type.calls} right={p.type.puts} leftLabel="Calls" rightLabel="Puts"
            leftColor="#4c9aff" rightColor="#c77dff" />
        </div>
      </div>

      {/* El cruce: lo que de verdad importa */}
      <div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
          Cruzando las dos cosas (aquí está la señal real):
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 7 }}>
          {cells.map((x) => (
            <div key={x.label} style={{
              border: "1px solid var(--border-soft)", borderRadius: 8, padding: "7px 9px",
              background: "var(--panel-2)", opacity: x.value > 0 ? 1 : 0.45,
            }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {x.bull ? "↑" : "↓"} {x.label}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: x.value > 0 ? (x.bull ? "#12b76a" : "#f04438") : "var(--muted)" }}>
                {money(x.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {p.bullishPct !== null && (
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          Del dinero con dirección clara: <span style={{ color: "#12b76a" }}>{p.bullishPct}% arriba</span>
          {" · "}<span style={{ color: "#f04438" }}>{100 - p.bullishPct}% abajo</span>
        </div>
      )}

      <div style={{ fontSize: 13, lineHeight: 1.6, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
        <b>💬 ¿Qué significa?</b> {p.meaning}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        <b style={{ color: c }}>💡 ¿Qué puedes hacer tú?</b> {p.whatYouCanDo}
      </div>

      <ul style={{ margin: 0, paddingLeft: 17, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>
        {p.caveats.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </section>
  );
}
