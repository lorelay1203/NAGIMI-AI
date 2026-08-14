"use client";

import { useEffect, useState } from "react";
import type { AffordableCandidate } from "@/lib/wheelAfford";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const money2 = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

const SOURCE_LABEL: Record<string, string> = {
  bid: "bid real",
  ultimo: "último precio −10%",
  modelo: "modelo −15%",
};

type Row = AffordableCandidate;
type Cell = { v: string; tone?: "good" | "bad" };

// Columnas que se pueden mostrar u ocultar. Cada una sabe leer su valor de la fila.
const COLS: { key: string; label: string; render: (c: Row) => Cell }[] = [
  { key: "cobras", label: "💵 Cobras", render: (c) => ({ v: money(c.metrics!.credit), tone: "good" }) },
  { key: "necesitas", label: "💰 Necesitas", render: (c) => ({ v: money(c.metrics!.collateral), tone: c.afford.affordable ? undefined : "bad" }) },
  { key: "anual", label: "📈 Anual", render: (c) => ({ v: pct(c.metrics!.annualizedPct), tone: "good" }) },
  { key: "colchon", label: "🛡️ Colchón", render: (c) => ({ v: pct(c.metrics!.cushionPct) }) },
  { key: "delta", label: "Δ Delta", render: (c) => ({ v: c.delta.toFixed(2) }) },
  { key: "theta", label: "Θ Theta/día", render: (c) => ({ v: c.theta != null ? `$${Math.round(Math.abs(c.theta) * 100)}` : "—", tone: "good" }) },
  { key: "iv", label: "📊 IV", render: (c) => ({ v: pct(c.iv * 100) }) },
  { key: "dias", label: "📅 Días", render: (c) => ({ v: `${c.dte}d` }) },
];
const COLS_KEY = "nagimi.wheelCols";

const th: React.CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: 11, color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 13, whiteSpace: "nowrap", borderBottom: "1px solid var(--border-soft)" };

export default function WheelTable({ rows }: { rows: AffordableCandidate[]; view?: "estudiante" | "pro" }) {
  const [visible, setVisible] = useState<Set<string>>(new Set(COLS.map((c) => c.key)));
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) setVisible(new Set(arr)); }
    } catch { /* noop */ }
  }, []);
  const toggle = (key: string) => setVisible((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) return prev;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
    return next;
  });

  if (rows.length === 0) {
    return <div className="card wheel-empty">Sin candidatos con este perfil. Prueba otro preset.</div>;
  }

  const cols = COLS.filter((c) => visible.has(c.key));
  const operable = rows.filter((c) => !c.blocked && c.metrics);
  const blockedCount = rows.length - operable.length;
  const nCols = 2 + cols.length + 1; // Trade + Prob + métricas + Puntaje

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Ajustar qué columnas ver */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>👁️ Columnas:</span>
        {COLS.map((c) => {
          const on = visible.has(c.key);
          return (
            <button key={c.key} type="button" onClick={() => toggle(c.key)}
              style={{ padding: "3px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, border: on ? "1px solid var(--accent)" : "1px solid var(--border)", background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)" }}>
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--panel)" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Trade</th>
              <th style={th}>🎯 Prob.</th>
              {cols.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
              <th style={th}>⭐ Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {operable.map((c) => {
              const m = c.metrics!;
              const prob = Math.round(m.probExpireWorthless);
              const probColor = prob >= 70 ? "#12b76a" : prob >= 50 ? "#e0a800" : "#f04438";
              const key = `${c.ticker}-${c.strike}-${c.expiration}`;
              const isOpen = openKey === key;
              const dim = !c.afford.affordable;
              return (
                <>
                  <tr key={key} onClick={() => setOpenKey(isOpen ? null : key)}
                    style={{ cursor: "pointer", background: isOpen ? "var(--panel-2)" : "transparent", opacity: dim ? 0.55 : 1 }}
                    title="Toca para ver qué pasa si ganas o te asignan">
                    <td style={{ ...td, textAlign: "left" }}>
                      <span style={{ color: "var(--accent)", marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
                      <b>{c.ticker}</b>{" "}
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        vender put ${c.strike}{c.longStrike != null ? ` / comprar $${c.longStrike}` : ""}
                      </span>
                      {dim && <span style={{ color: "#f0a", fontSize: 11, marginLeft: 6 }}>no te alcanza</span>}
                    </td>
                    <td style={{ ...td, color: probColor, fontWeight: 700 }}>{prob}%</td>
                    {cols.map((col) => {
                      const cell = col.render(c);
                      const color = cell.tone === "good" ? "#12b76a" : cell.tone === "bad" ? "#f04438" : "var(--text)";
                      return <td key={col.key} style={{ ...td, color, fontWeight: cell.tone ? 700 : 400 }}>{cell.v}</td>;
                    })}
                    <td style={{ ...td, fontWeight: 700 }}>{c.score!.total}</td>
                  </tr>
                  {isOpen && (
                    <tr key={`${key}-d`}>
                      <td colSpan={nCols} style={{ padding: "10px 14px", background: "var(--panel-2)", borderBottom: "1px solid var(--border-soft)", fontSize: 12.5, lineHeight: 1.5 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div><b>✅ Si expira sin valor</b> ({prob}%): te quedas <b style={{ color: "#12b76a" }}>{money(m.credit)}</b> y se libera tu efectivo.</div>
                          {c.longStrike != null
                            ? <div><b>📉 Si cae fuerte</b>: tu pérdida está topada en <b style={{ color: "#f04438" }}>{money(m.collateral)}</b> (por eso es un spread — no compras acciones).</div>
                            : <>
                                <div><b>📦 Si te asignan</b>: compras 100 acciones a ${c.strike}. Tu costo real queda en <b>{money2(m.breakeven)}</b> y ahí vendes calls (la "rueda").</div>
                                <div><b>⚠️ Si cae 20%</b>: tendrías las acciones ~{money2(c.spot * 0.8)}, con pérdida no realizada frente a tu costo de {money2(m.breakeven)}.</div>
                              </>}
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>Prima calculada con {SOURCE_LABEL[c.premium!.source] ?? c.premium!.source}. Precios retrasados — confirma en tu bróker.</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {blockedCount > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {blockedCount} descartado{blockedCount === 1 ? "" : "s"} por baja liquidez (sin quién comprar/vender).
        </div>
      )}
    </div>
  );
}
