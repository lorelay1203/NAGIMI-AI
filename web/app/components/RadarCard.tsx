"use client";

// Radar de flujo — dos lentes:
//  · Descubrir: acciones nuevas / poco famosas con flujo fuerte hoy + dirección.
//  · Contratos baratos: opciones < $10 que más se movieron (para capital chico).
// Clic en un ticker lo analiza.

import { useCallback, useEffect, useState } from "react";

interface DiscoverRow {
  ticker: string; callPrem: number; putPrem: number; total: number; count: number;
  direction: "up" | "down" | "mixed"; callPct: number;
}
interface LowCostRow {
  ticker: string; type: "call" | "put" | null; strike: number | null; expiry: string | null;
  price: number; retPct: number; premium: number; volume: number;
}

const money = (n: number) => {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + Math.round(n);
};

const DIR: Record<string, { icon: string; color: string; label: string }> = {
  up: { icon: "▲", color: "#4ad991", label: "Alcista" },
  down: { icon: "▼", color: "#ff8a82", label: "Bajista" },
  mixed: { icon: "▬", color: "#f5c451", label: "Mixto" },
};

const tab = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
  background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--text)",
});
const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { fontSize: 12.5, padding: "7px 8px", borderTop: "1px solid var(--border-soft)" };

type Mode = "discover" | "lowcost";
const RANGES: { id: string; label: string }[] = [{ id: "0-1", label: "$0–$1" }, { id: "1-5", label: "$1–$5" }, { id: "5-10", label: "$5–$10" }];

export default function RadarCard({ onPick }: { onPick: (ticker: string) => void }) {
  const [mode, setMode] = useState<Mode>("discover");
  const [range, setRange] = useState("1-5");
  const [disc, setDisc] = useState<DiscoverRow[] | null>(null);
  const [low, setLow] = useState<LowCostRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const url = mode === "lowcost" ? `/api/radar?mode=lowcost&range=${range}` : `/api/radar`;
      const r = await fetch(url).then((x) => x.json());
      if (r.error) { setErr(r.error); }
      else if (mode === "lowcost") setLow(r.rows ?? []);
      else setDisc(r.rows ?? []);
    } catch { setErr("No se pudo cargar el radar."); }
    setLoading(false);
  }, [mode, range]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📡 Radar de flujo</div>
          <div className="card-sub">
            {mode === "discover"
              ? "Acciones poco famosas con más dinero en opciones hoy y su dirección."
              : "Contratos baratos (<$10) que más se movieron hoy, con +$1M de premium — para capital chico."}{" "}
            Clic para analizar. <b>Material de estudio.</b>
          </div>
        </div>
        <button type="button" onClick={load} disabled={loading} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>
          {loading ? "Escaneando…" : "🔄 Actualizar"}
        </button>
      </div>

      {/* Lentes */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={tab(mode === "discover")} onClick={() => setMode("discover")}>🔎 Descubrir</button>
        <button type="button" style={tab(mode === "lowcost")} onClick={() => setMode("lowcost")}>💲 Contratos baratos</button>
        {mode === "lowcost" && (
          <span style={{ display: "flex", gap: 6, marginLeft: 4 }}>
            {RANGES.map((r) => (
              <button key={r.id} type="button" style={{ ...tab(range === r.id), padding: "5px 10px", fontSize: 12 }} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </span>
        )}
      </div>

      {err && <div className="error">⚠ {err}</div>}

      {/* Lente Descubrir */}
      {mode === "discover" && disc && (
        disc.length === 0 && !loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin flujo destacado en nombres poco conocidos ahora mismo (mercado cerrado o sin trades grandes).</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {disc.map((r) => {
              const d = DIR[r.direction];
              return (
                <button key={r.ticker} type="button" onClick={() => onPick(r.ticker)}
                  style={{ textAlign: "left", background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, color: "var(--text)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{r.ticker}</span>
                    <span style={{ color: d.color, fontWeight: 700, fontSize: 13 }}>{d.icon} {d.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{money(r.total)} en {r.count} trade{r.count !== 1 ? "s" : ""}</div>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${r.callPct}%`, background: "#2ec77f" }} />
                    <div style={{ width: `${100 - r.callPct}%`, background: "#ff5d52" }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{r.callPct}% calls · {100 - r.callPct}% puts</div>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Lente Contratos baratos */}
      {mode === "lowcost" && low && (
        low.length === 0 && !loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin contratos destacados en ese rango ahora mismo.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Contrato</th>
                  <th style={th}>Precio</th>
                  <th style={th}>Cambio hoy</th>
                  <th style={th}>Premium</th>
                  <th style={th}>Volumen</th>
                </tr>
              </thead>
              <tbody>
                {low.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>
                      <button type="button" onClick={() => onPick(r.ticker)} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0 }}>{r.ticker}</button>
                      {r.type && <span style={{ color: r.type === "call" ? "#4ad991" : "#ff8a82", marginLeft: 6, fontSize: 11.5 }}>{r.expiry?.slice(5)} {r.type === "call" ? "C" : "P"} ${r.strike}</span>}
                    </td>
                    <td style={td}>${r.price.toFixed(2)}</td>
                    <td style={{ ...td, color: r.retPct >= 0 ? "#4ad991" : "#ff8a82", fontWeight: 600 }}>{r.retPct >= 0 ? "+" : ""}{r.retPct}%</td>
                    <td style={td}>{money(r.premium)}</td>
                    <td style={td}>{r.volume.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {loading && !disc && !low && <div style={{ color: "var(--muted)", fontSize: 13 }}>Escaneando el flujo del mercado…</div>}
    </section>
  );
}
