"use client";

// Panel de GRIEGOS + volumen + OI por pata — para corroborar el trade con datos
// reales de MarketSnack (delta, gamma, theta, vega, precio, vol, OI, IV).
// Solo lectura. Se alimenta de /api/contract.

import { useEffect, useState } from "react";

export interface GreeksLeg {
  side: "buy" | "sell";
  optionType: "call" | "put";
  strike: number;
  quantity: number;
}
interface Detail {
  price: number | null; priceChangePct: number | null;
  bid: number; ask: number; mid: number; iv: number | null;
  delta: number | null; gamma: number | null; theta: number | null; vega: number | null;
  volume: number | null; openInterest: number | null;
}

const f = (x: number | null, d = 2) => (x == null ? "—" : x.toFixed(d));
const sign = (s: "buy" | "sell") => (s === "buy" ? 1 : -1);

export default function GreeksPanel({ ticker, expiration, legs }: { ticker: string; expiration: string; legs: GreeksLeg[] }) {
  const [rows, setRows] = useState<(Detail | null)[]>([]);
  const [loading, setLoading] = useState(false);

  const key = `${ticker}|${expiration}|${legs.map((l) => `${l.side}${l.optionType}${l.strike}x${l.quantity}`).join(",")}`;
  useEffect(() => {
    if (!ticker || !expiration || legs.length === 0) { setRows([]); return; }
    let cancel = false;
    setLoading(true);
    Promise.all(
      legs.map((l) =>
        fetch(`/api/contract?ticker=${encodeURIComponent(ticker)}&type=${l.optionType}&strike=${l.strike}&expiration=${encodeURIComponent(expiration)}`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    ).then((res) => { if (!cancel) { setRows(res); setLoading(false); } });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!ticker || !expiration || legs.length === 0) return null;

  // Griegos NETOS de la posición (sumando compra +/venta −, por cantidad).
  const net = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  let any = false;
  rows.forEach((d, i) => {
    if (!d) return; any = true; const s = sign(legs[i].side) * legs[i].quantity;
    net.delta += s * (d.delta ?? 0); net.gamma += s * (d.gamma ?? 0);
    net.theta += s * (d.theta ?? 0); net.vega += s * (d.vega ?? 0);
  });

  const th: React.CSSProperties = { textAlign: "right", padding: "5px 7px", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 7px", fontSize: 12, borderTop: "1px solid var(--border-soft)" };

  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        🔬 Griegos y liquidez por pata {loading && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· cargando…</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Pata</th>
              <th style={th}>Precio</th>
              <th style={th}>Δ Delta</th>
              <th style={th}>Γ Gamma</th>
              <th style={th}>Θ Theta</th>
              <th style={th}>Vega</th>
              <th style={th}>IV</th>
              <th style={th}>Vol</th>
              <th style={th}>OI</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l, i) => {
              const d = rows[i];
              const tag = `${l.side === "buy" ? "+" : "−"}${l.quantity > 1 ? l.quantity : ""}${l.optionType === "call" ? "C" : "P"} $${l.strike}`;
              return (
                <tr key={i}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, color: l.side === "buy" ? "#4ad991" : "#ff8a82" }}>{tag}</td>
                  {d ? (
                    <>
                      <td style={td}>${f(d.price ?? d.mid)}{d.priceChangePct != null && <span style={{ color: d.priceChangePct >= 0 ? "#4ad991" : "#ff8a82", fontSize: 10 }}> {d.priceChangePct >= 0 ? "+" : ""}{d.priceChangePct.toFixed(0)}%</span>}</td>
                      <td style={td}>{f(d.delta)}</td>
                      <td style={td}>{f(d.gamma, 4)}</td>
                      <td style={td}>{f(d.theta)}</td>
                      <td style={td}>{f(d.vega)}</td>
                      <td style={td}>{d.iv != null ? `${(d.iv * 100).toFixed(0)}%` : "—"}</td>
                      <td style={{ ...td, color: (d.volume ?? 0) > 0 ? "var(--text)" : "#ff8a82" }}>{d.volume ?? "—"}</td>
                      <td style={{ ...td, color: (d.openInterest ?? 0) >= 100 ? "var(--text)" : "#f5c451" }}>{d.openInterest ?? "—"}</td>
                    </>
                  ) : (
                    <td style={{ ...td, color: "var(--muted)" }} colSpan={8}>sin datos del contrato</td>
                  )}
                </tr>
              );
            })}
            {any && (
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>NETO posición</td>
                <td style={td}>—</td>
                <td style={{ ...td, fontWeight: 700, color: net.delta >= 0 ? "#4ad991" : "#ff8a82" }}>{f(net.delta)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{f(net.gamma, 4)}</td>
                <td style={{ ...td, fontWeight: 700, color: net.theta >= 0 ? "#4ad991" : "#ff8a82" }}>{f(net.theta)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{f(net.vega)}</td>
                <td style={td} colSpan={3}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>
        <b>Δ</b> delta ≈ prob. de terminar ITM y cuánto se mueve por $1 del subyacente · <b>Γ</b> qué tan rápido cambia delta ·
        <b> Θ</b> lo que pierde por día (tiempo) · <b>Vega</b> sensibilidad a la volatilidad ·
        <b> Vol/OI</b> liquidez (OI &lt;100 o Vol 0 = cuidado, spread ancho). Datos MarketSnack, para estudio.
      </div>
    </div>
  );
}
