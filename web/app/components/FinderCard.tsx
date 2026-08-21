"use client";

// Buscador "¿qué hago con $X?" — entras un ticker y cuánto tienes, y te dice
// TODAS las estrategias que caben en ese dinero (comprar call/put, spreads,
// credit spreads, iron condor, cash-secured put), con su probabilidad y riesgo.

import { useState } from "react";

interface Strategy {
  name: string;
  kind: string;
  direction: "alcista" | "bajista" | "neutral";
  legsDesc: string[];
  capital: number;
  maxGain: number | null;
  maxLoss: number;
  pop: number;
  breakevens: number[];
  note: string;
}
interface FinderResult {
  ticker: string;
  spot: number;
  expiration: string;
  dte: number;
  ivPct: number;
  budget: number;
  fits: Strategy[];
  tooExpensive: { name: string; capital: number; direction: string }[];
}

const money = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const DIR_COLOR: Record<string, string> = { alcista: "#12b76a", bajista: "#f04438", neutral: "#e0a800" };
const DIR_ICON: Record<string, string> = { alcista: "📈 sube", bajista: "📉 baja", neutral: "↔️ rango" };

export default function FinderCard() {
  const [ticker, setTicker] = useState("");
  const [budget, setBudget] = useState(100);
  const [term, setTerm] = useState<"1dte" | "corto" | "mes">("1dte"); // plazo (default: prioriza 1DTE)
  const [res, setRes] = useState<FinderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  async function search() {
    const t = ticker.trim().toUpperCase();
    if (!t || !(budget > 0) || busy) return;
    setBusy(true); setErr(null); setRes(null); setOpen(null);
    try {
      const r = await fetch(`/api/finder?ticker=${encodeURIComponent(t)}&budget=${budget}&term=${term}`).then((x) => x.json());
      if (r.error) setErr(r.error); else setRes(r);
    } catch {
      setErr("No se pudo buscar. Revisa la cookie de MarketSnack.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>💡 ¿Qué hago con mi dinero?</div>
        <div className="card-sub">
          Escribe un ticker y cuánto tienes. El buscador te muestra <b>todas las estrategias que
          caben</b> en ese dinero — comprar call/put, spreads, iron condor y más — con su
          probabilidad y riesgo, para que compares y elijas.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
          Ticker
          <div>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="SPY"
              style={{ marginTop: 4, width: 90, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "7px 9px", fontSize: 14, fontWeight: 700, textTransform: "uppercase" }} />
          </div>
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
          Cuánto tienes ($)
          <div>
            <input type="number" min={1} value={budget || ""} onChange={(e) => setBudget(Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              style={{ marginTop: 4, width: 100, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "7px 9px", fontSize: 14, fontWeight: 700 }} />
          </div>
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
          Plazo
          <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
            {([["1dte", "1DTE (mañana)"], ["corto", "Corto (3-14d)"], ["mes", "~1 mes"]] as const).map(([tm, lbl]) => (
              <button key={tm} type="button" onClick={() => setTerm(tm)}
                style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, border: term === tm ? "1px solid var(--accent)" : "1px solid var(--border)", background: term === tm ? "var(--accent)" : "transparent", color: term === tm ? "#fff" : "var(--text)" }}>
                {lbl}
              </button>
            ))}
          </div>
        </label>
        <button type="button" onClick={search} disabled={busy}
          style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {busy ? "Buscando…" : "🔍 Buscar estrategias"}
        </button>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "#ff9b94" }}>⚠️ {err}</div>}

      {res && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {res.ticker} a <b style={{ color: "var(--text)" }}>${res.spot.toFixed(2)}</b> · vence {res.expiration} ({res.dte}d) ·
            IV {res.ivPct}% · con <b style={{ color: "var(--text)" }}>{money(res.budget)}</b> caben{" "}
            <b style={{ color: "#4ad991" }}>{res.fits.length}</b> estrategias.
          </div>

          {res.fits.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Ninguna estrategia cabe en {money(res.budget)} para {res.ticker}. Prueba un ticker más
              barato o sube el monto. (La más barata cuesta {res.tooExpensive.length ? money(Math.min(...res.tooExpensive.map((t) => t.capital))) : "—"}.)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {res.fits.map((s, i) => {
                const isOpen = open === i;
                const rr = s.maxGain != null ? (s.maxGain / s.maxLoss) : null;
                return (
                  <div key={i} style={{ background: "var(--panel-2)", border: `1px solid ${isOpen ? "var(--accent)" : "var(--border-soft)"}`, borderRadius: 10, padding: "9px 12px" }}>
                    <div onClick={() => setOpen(isOpen ? null : i)} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--accent)" }}>{isOpen ? "▾" : "▸"}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: DIR_COLOR[s.direction] }}>{DIR_ICON[s.direction]}</span>
                      <span style={{ fontSize: 12, color: "#4ad991", fontWeight: 700 }}>{Math.round(s.pop * 100)}% prob.</span>
                      <span style={{ marginLeft: "auto", fontSize: 12 }}>
                        cuesta <b>{money(s.capital)}</b>
                      </span>
                    </div>
                    {isOpen && (() => {
                      // Stop-loss recomendado: crédito → 2× la prima (tope = pérdida máx);
                      // débito/compra → cortar a la mitad de lo que pagaste.
                      const isCredit = ["put_credit", "call_credit", "iron_condor", "csp"].includes(s.kind);
                      const stop = isCredit
                        ? Math.min(Math.round(2 * (s.maxGain ?? 0)) || s.maxLoss, s.maxLoss)
                        : Math.round(s.capital * 0.5);
                      const take = s.maxGain != null ? Math.max(1, Math.round(s.maxGain * 0.5)) : null;
                      return (
                        <div style={{ marginTop: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 8, fontSize: 12.5, lineHeight: 1.55 }}>
                          {/* Por qué */}
                          <div style={{ marginBottom: 4 }}><b>🧠 Por qué:</b> {s.note}</div>
                          <div style={{ color: "var(--muted)", marginBottom: 4 }}>{s.legsDesc.join(" · ")}</div>
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
                            <span>💵 Cuesta: <b>{money(s.capital)}</b></span>
                            <span>📈 Gana máx: <b style={{ color: "#4ad991" }}>{s.maxGain == null ? "mucho (sin tope)" : money(s.maxGain)}</b></span>
                            <span>📉 Pierde máx: <b style={{ color: "#ff8a82" }}>{money(s.maxLoss)}</b></span>
                            {rr != null && <span>⚖️ Gana/pierde: <b>1:{(1 / rr).toFixed(1)}</b></span>}
                            {s.breakevens.length > 0 && <span>⚖️ Equilibrio: <b>{s.breakevens.map((b) => `$${b}`).join(" / ")}</b></span>}
                          </div>
                          {/* Gestión: stop-loss recomendado */}
                          <div style={{ background: "rgba(255,138,130,0.08)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 10px" }}>
                            📏 <b>Gestión recomendada:</b>
                            {take != null && <> toma ganancia a <b style={{ color: "#12b76a" }}>+{money(take)}</b> ·</>}
                            <b style={{ color: "#f04438" }}> 🛑 stop-loss: cierra si pierdes {money(stop)}</b>
                            {isCredit ? " (≈2× la prima)" : " (la mitad de lo que pagaste)"}.
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {res.tooExpensive.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
              No te alcanza para: {res.tooExpensive.map((t) => `${t.name} (${money(t.capital)})`).join(" · ")}.
            </div>
          )}
        </>
      )}
    </section>
  );
}
