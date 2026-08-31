"use client";

// 🐋 Sigue a los Grandes — las jugadas de inversores gigantes (Buffett, Burry,
// Ackman, Dalio…) desde sus reportes 13F de la SEC, con el ticker mapeado para
// que puedas analizarlo y buscar contratos baratos en la misma dirección.

import { useCallback, useEffect, useState } from "react";

interface Investor { id: string; name: string; fund: string; group: string; note?: string }
interface Move {
  name: string; ticker: string | null; kind: string; direction: string;
  value: number; shares: number; prevShares: number; pctOfPortfolio: number; changePct: number | null;
}
interface Report {
  investor: string; fund: string; periodNow: string; periodPrev: string | null;
  filedNow: string; totalValue: number; positions: number; moves: Move[]; note?: string;
}

const bn = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v)}`);
const KIND: Record<string, { label: string; color: string }> = {
  nueva: { label: "🆕 Compra nueva", color: "#12b76a" },
  aumento: { label: "➕ Aumentó", color: "#12b76a" },
  recorte: { label: "➖ Recortó", color: "#f04438" },
  salida: { label: "❌ Vendió todo", color: "#f04438" },
  mantiene: { label: "= Mantiene", color: "#7a8699" },
};

export default function GrandesPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [sel, setSel] = useState("buffett");
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [groups, setGroups] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/bigmoney").then((r) => r.json())
      .then((d) => { setInvestors(d.investors ?? []); setGroups(d.groups ?? {}); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true); setError(null); setRep(null); setShowAll(false);
    try {
      const r = await fetch(`/api/bigmoney?investor=${id}`).then((x) => x.json());
      if (r.error) setError(r.error); else setRep(r);
    } catch { setError("No se pudo cargar el reporte de la SEC."); }
    setLoading(false);
  }, []);
  useEffect(() => { load(sel); }, [sel, load]);

  const cur = investors.find((i) => i.id === sel);
  const moves = rep ? (showAll ? rep.moves : rep.moves.filter((m) => m.kind !== "mantiene")).slice(0, showAll ? 200 : 25) : [];

  return (
    <main className="wrap page-stack" style={{ maxWidth: 900 }}>
      <div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
        <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>🐋 Sigue a los Grandes</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, fontSize: 14 }}>
          Las jugadas de los inversores gigantes, de sus reportes oficiales a la <b>SEC (13F)</b>. Toca un ticker
          para analizarlo y buscar <b>contratos baratos en la misma dirección</b>.
        </p>
      </div>

      {/* Selector de inversor, agrupado por estilo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Object.keys(groups).map((g) => {
          const list = investors.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>{groups[g]}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {list.map((i) => (
                  <button key={i.id} type="button" onClick={() => setSel(i.id)} title={i.fund}
                    style={{ padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: sel === i.id ? "none" : "1px solid var(--border)",
                      background: sel === i.id ? "var(--brand-grad)" : "var(--panel)", color: sel === i.id ? "#fff" : "var(--text)" }}>
                    {i.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aviso honesto */}
      <div style={{ fontSize: 11.5, color: "var(--muted)", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", lineHeight: 1.5 }}>
        ⚠️ El 13F es <b>trimestral</b> y llega <b>~45 días tarde</b>: muestra qué acciones tienen (largo plazo), no el minuto exacto ni opciones.
        Es su convicción — tú la cruzas con el flujo de opciones en vivo al analizar el ticker.
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>Bajando el reporte de {cur?.name ?? "la SEC"}…</div>}
      {error && !loading && <div className="card" style={{ border: "1px solid #f0443855" }}><div style={{ color: "#ff8a82", fontWeight: 700 }}>No se pudo cargar</div><div style={{ fontSize: 13, color: "var(--muted)" }}>{error}</div></div>}

      {rep && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            <Tile label="Inversor" value={rep.investor} sub={rep.fund} />
            <Tile label="Cartera total" value={bn(rep.totalValue)} sub={`${rep.positions} posiciones`} />
            <Tile label="Trimestre" value={rep.periodNow} sub={rep.periodPrev ? `vs ${rep.periodPrev}` : ""} />
            <Tile label="Reportado" value={rep.filedNow} sub="a la SEC" />
          </div>

          {rep.note && <div style={{ fontSize: 12, color: "#e0a800", background: "rgba(224,168,0,.08)", border: "1px solid #e0a80044", borderRadius: 8, padding: "7px 11px" }}>ℹ️ {rep.note}</div>}

          <div className="card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead><tr>
                  <th style={th}>Jugada</th><th style={th}>Ticker</th><th style={{ ...th, textAlign: "left" }}>Empresa</th>
                  <th style={{ ...th, textAlign: "right" }}>Valor</th><th style={{ ...th, textAlign: "right" }}>% cartera</th>
                  <th style={{ ...th, textAlign: "right" }}>Cambio</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {moves.map((m, i) => {
                    const k = KIND[m.kind] ?? KIND.mantiene;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid var(--border-soft)" }}>
                        <td style={{ ...td, color: k.color, fontWeight: 700, fontSize: 11.5 }}>{k.label}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{m.ticker ?? "—"}</td>
                        <td style={{ ...td, textAlign: "left", color: "var(--muted)" }}>{m.name.slice(0, 26)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{m.value > 0 ? bn(m.value) : "—"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{m.pctOfPortfolio >= 0.05 ? `${m.pctOfPortfolio.toFixed(1)}%` : "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: m.changePct == null ? "#12b76a" : m.changePct >= 0 ? "#12b76a" : "#f04438", fontWeight: 700 }}>
                          {m.changePct == null ? "nueva" : `${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(0)}%`}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {m.ticker && m.direction !== "neutral" && (
                            <a href={`/?ticker=${encodeURIComponent(m.ticker)}`} title={`Analizar ${m.ticker} y buscar contratos ${m.direction}s`}
                              style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: m.direction === "alcista" ? "#12b76a" : "#f04438", borderRadius: 6, padding: "3px 8px", textDecoration: "none", whiteSpace: "nowrap" }}>
                              💡 {m.direction === "alcista" ? "Contratos ↑" : "Contratos ↓"}
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => setShowAll((v) => !v)}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {showAll ? "Ver solo las jugadas" : "Ver toda la cartera"}
            </button>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
              💡 = analiza el ticker: verás el flujo de opciones en vivo y contratos que caben en tu cuenta.
            </span>
          </div>
        </>
      )}

      <div className="disclaimer">
        Datos públicos de la SEC (13F). Que un grande compre una acción no garantiza que suba. Material de estudio, no consejo financiero.
        Jeff Bezos y otros no reportan 13F (su dinero es acción propia) — para seguir a Amazon, analiza <b>AMZN</b>.
      </div>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "center", padding: "9px 10px", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "center", padding: "9px 10px", fontSize: 12.5, whiteSpace: "nowrap" };
