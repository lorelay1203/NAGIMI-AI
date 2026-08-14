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

// Columnas (casillas) que se pueden mostrar u ocultar. La usuaria ajusta qué ve.
const COLS: { key: string; label: string }[] = [
  { key: "cobras", label: "💵 Cobras" },
  { key: "strike", label: "🎯 Strike" },
  { key: "dias", label: "📅 Días" },
  { key: "delta", label: "Δ Delta" },
  { key: "theta", label: "Θ Theta" },
  { key: "iv", label: "📊 IV" },
  { key: "colchon", label: "🛡️ Colchón" },
  { key: "anual", label: "📈 Anual" },
  { key: "necesitas", label: "💰 Necesitas" },
];
const COLS_KEY = "nagimi.wheelCols";

export default function WheelTable({
  rows,
  view,
}: {
  rows: AffordableCandidate[];
  view: "estudiante" | "pro";
}) {
  const [visible, setVisible] = useState<Set<string>>(new Set(COLS.map((c) => c.key)));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) setVisible(new Set(arr)); }
    } catch { /* noop */ }
  }, []);
  const toggle = (key: string) => setVisible((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) return prev; // no dejar todo oculto
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
    return next;
  });

  if (rows.length === 0) {
    return <div className="card wheel-empty">Sin candidatos con este perfil. Prueba otro preset.</div>;
  }
  return (
    <div className="wheel-list">
      {/* Ajustar qué columnas ver */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>👁️ Ver:</span>
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
      {rows.map((c) => (
        <WheelRow key={`${c.ticker}-${c.strike}-${c.expiration}`} c={c} view={view} visible={visible} />
      ))}
    </div>
  );
}

function WheelRow({ c, visible }: { c: AffordableCandidate; view: "estudiante" | "pro"; visible: Set<string> }) {
  const [open, setOpen] = useState(false);
  const show = (k: string) => visible.has(k);

  if (c.blocked) {
    return (
      <div className="card wheel-row blocked">
        <div className="wheel-row-head">
          <b>{c.ticker}</b> ${c.strike} · {c.expiration}
          <span className="wheel-tag danger">Ilíquido — no operable</span>
        </div>
        <p className="wheel-blocked-why">
          {c.blockReason === "sin_bid" && "Nadie está poniendo precio de compra: no podrías vender."}
          {c.blockReason === "spread_ancho" && "La horquilla es demasiado ancha: perderías dinero al entrar."}
          {c.blockReason === "oi_bajo" && "Muy pocos contratos abiertos: no hay con quién operar."}
        </p>
      </div>
    );
  }

  const m = c.metrics!;
  const s = c.score!;
  const p = c.premium!;
  const prob = Math.round(m.probExpireWorthless);
  const assignPct = Math.round(Math.abs(c.delta) * 100); // delta ≈ prob. de asignación
  const thetaDay = c.theta != null ? Math.abs(c.theta) * 100 : null; // $/día a tu favor (vendes)

  return (
    <div className={`card wheel-row ${c.afford.affordable ? "" : "unafford"}`} style={{ gap: 10 }}>
      <button onClick={() => setOpen((v) => !v)} type="button"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", width: "100%", padding: 0, color: "var(--text)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          {open ? "▾" : "▸"} {c.ticker} · {c.longStrike != null
            ? <>vender put ${c.strike} / comprar ${c.longStrike} <span style={{ fontSize: 11, color: "#4ad991", fontWeight: 600 }}>· spread</span></>
            : <>vender put ${c.strike}</>}
          {!c.afford.affordable && <span style={{ marginLeft: 8, fontSize: 11, color: "#f0a", fontWeight: 600 }}>· no te alcanza</span>}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>puntaje <b style={{ color: "var(--text)", fontSize: 15 }}>{s.total}</b>/100</span>
      </button>

      {/* Casillas visuales con los datos clave */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 8 }}>
        {show("cobras") && <Tile label="💵 Cobras" value={money(m.credit)} tone="good" sub="prima hoy" />}
        {show("strike") && <Tile label="🎯 Strike" value={`$${c.strike}`} sub={`spot $${c.spot.toFixed(0)}`} />}
        {show("dias") && <Tile label="📅 Días" value={`${c.dte}d`} sub={c.expiration.slice(5)} />}
        {show("delta") && <Tile label="Δ Delta" value={c.delta.toFixed(2)} sub={`~${assignPct}% asignación`} />}
        {show("theta") && <Tile label="Θ Theta" value={thetaDay != null ? `$${thetaDay.toFixed(0)}` : "—"} tone="good" sub="al día a tu favor" />}
        {show("iv") && <Tile label="📊 IV" value={pct(c.iv * 100)} sub={c.ivSource === "estimada" ? "estimada" : "real"} />}
        {show("colchon") && <Tile label="🛡️ Colchón" value={pct(m.cushionPct)} sub="puede caer antes" />}
        {show("anual") && <Tile label="📈 Anual" value={pct(m.annualizedPct)} tone="good" sub="rinde/año" />}
        {show("necesitas") && <Tile label="💰 Necesitas" value={money(m.collateral)} tone={c.afford.affordable ? undefined : "bad"} sub={c.afford.affordable ? "en efectivo" : `faltan ${money(c.afford.shortfall)}`} />}
      </div>

      {/* Barra visual: probabilidad de ganar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
          <span>Probabilidad de ganar (que expire sin valor)</span>
          <b style={{ color: prob >= 70 ? "#12b76a" : prob >= 50 ? "#e0a800" : "#f04438" }}>{prob}%</b>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
          <div style={{ width: `${prob}%`, height: "100%", background: prob >= 70 ? "#12b76a" : prob >= 50 ? "#e0a800" : "#f04438" }} />
        </div>
      </div>

      {open && (
        <div className="wheel-outcomes" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 5, paddingTop: 4, borderTop: "1px solid var(--border-soft)" }}>
          <div><b>✅ Si expira sin valor</b> ({prob}%): te quedas <b>{money(m.credit)}</b> y se libera tu efectivo.</div>
          <div><b>📦 Si te asignan</b>: compras 100 acciones a ${c.strike}. Tu costo real queda en <b>{money2(m.breakeven)}</b> y ahí empiezas a vender calls (la "rueda").</div>
          <div><b>⚠️ Si cae 20%</b>: tendrías las acciones valiendo ~{money2(c.spot * 0.8)}, con pérdida no realizada frente a tu costo de {money2(m.breakeven)}.</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Prima calculada con {SOURCE_LABEL[p.source]}.</div>
        </div>
      )}
    </div>
  );
}

/** Casilla visual: etiqueta chica arriba, número grande abajo, con color según tono. */
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "#12b76a" : tone === "bad" ? "#f04438" : "var(--text)";
  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 10, padding: "8px 9px", border: "1px solid var(--border-soft)" }}>
      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
