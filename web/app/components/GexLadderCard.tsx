"use client";

import { useMemo, useState } from "react";
import type { GexHeatmap, HeatStrike } from "@/lib/gexHeatmap";
import { px } from "../format";

// Estilo MarketSnack: CALLS verde (derecha), PUTS rojo (izquierda).
const CALL = "#2ec77f";
const PUT = "#ff5d52";

function fmtGex(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
}

const SHOWN = [20, 40, 50, 100];

/**
 * Escalera de gamma por strike — HORIZONTAL (formato tipo MarketSnack Gamma Ladder).
 * Strikes en columna (mayor arriba). Barra VERDE a la derecha = gamma de calls;
 * barra ROJA a la izquierda = gamma de puts. Marca call wall, put wall e imán, y
 * resalta el strike más cercano al precio. Selector de cuántos strikes mostrar.
 */
export default function GexLadderCard({ h, callWall, putWall, magnet }: {
  h: GexHeatmap;
  callWall?: number | null;
  putWall?: number | null;
  magnet?: number | null;
}) {
  const [shown, setShown] = useState(40);

  // Strikes de mayor a menor, centrados en el spot, limitados a `shown`.
  const rows = useMemo(() => {
    const asc = [...h.strikes].sort((a, b) => a.strike - b.strike);
    if (asc.length === 0) return [] as HeatStrike[];
    // índice del strike más cercano al spot
    let ci = 0, best = Infinity;
    asc.forEach((s, i) => { const d = Math.abs(s.strike - h.spot); if (d < best) { best = d; ci = i; } });
    const half = Math.floor(shown / 2);
    const from = Math.max(0, ci - half);
    const to = Math.min(asc.length, from + shown);
    return asc.slice(from, to).sort((a, b) => b.strike - a.strike); // mayor arriba
  }, [h.strikes, h.spot, shown]);

  const maxMag = useMemo(() => Math.max(1, ...rows.map((s) => Math.max(s.callGex, s.putGex))), [rows]);

  // strike más cercano al spot (para resaltarlo)
  const spotStrike = useMemo(() => {
    let best = Infinity, val = 0;
    rows.forEach((s) => { const d = Math.abs(s.strike - h.spot); if (d < best) { best = d; val = s.strike; } });
    return val;
  }, [rows, h.spot]);

  if (rows.length === 0) return null;

  return (
    <section className="pro-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pro-title">Escalera de gamma por strike</div>
            <span className="pro-badge">PRO</span>
          </div>
          <div className="pro-sub">
            Cada strike con su gamma: <b style={{ color: CALL }}>verde a la derecha</b> = calls (techo),
            {" "}<b style={{ color: PUT }}>rojo a la izquierda</b> = puts (piso). La línea azul marca el precio.
          </div>
        </div>
        {/* Selector de cuántos strikes mostrar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Strikes:</span>
          {SHOWN.map((n) => (
            <button key={n} type="button" onClick={() => setShown(n)}
              style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 7, cursor: "pointer",
                border: shown === n ? "none" : "1px solid var(--border)",
                background: shown === n ? "var(--accent)" : "transparent",
                color: shown === n ? "#fff" : "var(--muted)" }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Encabezado de columnas */}
      <div style={{ display: "flex", alignItems: "center", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, padding: "0 2px 4px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, textAlign: "left" }}>◄ PUTS (gamma)</div>
        <div style={{ width: 92, textAlign: "center" }}>Strike</div>
        <div style={{ flex: 1, textAlign: "right" }}>CALLS (gamma) ►</div>
      </div>

      {/* Filas de la escalera */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        {rows.map((s) => {
          const isSpot = s.strike === spotStrike;
          const isCW = callWall != null && s.strike === callWall;
          const isPW = putWall != null && s.strike === putWall;
          const isMag = magnet != null && s.strike === magnet;
          const putW = (s.putGex / maxMag) * 100;
          const callW = (s.callGex / maxMag) * 100;
          const badge = isCW ? "🟢 CW" : isPW ? "🔴 PW" : isMag ? "🧲" : "";
          return (
            <div key={s.strike} title={`Strike $${px.format(s.strike)} · calls ${fmtGex(s.callGex)} · puts ${fmtGex(s.putGex)} · OI ${Math.round(s.openInterest).toLocaleString()}`}
              style={{ display: "flex", alignItems: "center", gap: 6, background: isSpot ? "rgba(77,139,255,.12)" : "transparent", borderRadius: 6, padding: "1px 2px" }}>
              {/* PUTS: barra roja a la izquierda + magnitud */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                {s.putGex > maxMag * 0.06 && <span style={{ fontSize: 9.5, color: "var(--muted)" }}>{fmtGex(s.putGex)}</span>}
                <div style={{ width: `${putW}%`, height: 12, background: PUT, opacity: 0.88, borderRadius: "3px 0 0 3px" }} />
              </div>
              {/* Strike + etiqueta */}
              <div style={{ width: 92, textAlign: "center", fontSize: 11.5, fontWeight: isSpot || badge ? 800 : 600, color: isSpot ? "#4d8bff" : "var(--text)", whiteSpace: "nowrap" }}>
                {px.format(s.strike)}
                {badge && <span style={{ fontSize: 9.5, marginLeft: 3 }}>{badge}</span>}
              </div>
              {/* CALLS: barra verde a la derecha + magnitud */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: `${callW}%`, height: 12, background: CALL, opacity: 0.88, borderRadius: "0 3px 3px 0" }} />
                {s.callGex > maxMag * 0.06 && <span style={{ fontSize: 9.5, color: "var(--muted)" }}>{fmtGex(s.callGex)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Línea del precio actual */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11 }}>
        <span style={{ width: 26, height: 2, background: "#4d8bff", display: "inline-block" }} />
        <span style={{ color: "#4d8bff", fontWeight: 700 }}>Precio ahora ${px.format(h.spot)}</span>
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
          GEX neto: <b style={{ color: h.totalNetGex >= 0 ? CALL : PUT }}>{h.totalNetGex >= 0 ? "" : "−"}{fmtGex(h.totalNetGex)}</b>
          {" — "}{h.totalNetGex >= 0 ? "γ+ (rango)" : "γ− (tendencia)"}
        </span>
      </div>

      <div className="disclaimer">Gamma real de MarketSnack por strike. No es consejo financiero.</div>
    </section>
  );
}
