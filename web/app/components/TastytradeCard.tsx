"use client";

// Tarjeta Tastytrade — SOLO LECTURA. Muestra valor, poder de compra y posiciones.
// Los datos vienen de /api/tastytrade/accounts (OAuth2 grant personal).

import { useCallback, useEffect, useState } from "react";
import { money0, int } from "../format";

interface Balance {
  "net-liquidating-value"?: string;
  "cash-balance"?: string;
  "equity-buying-power"?: string;
  "derivative-buying-power"?: string;
}
interface Position {
  symbol?: string;
  "underlying-symbol"?: string;
  "instrument-type"?: string;
  quantity?: string | number;
  "quantity-direction"?: string;
  "close-price"?: string;
  "average-open-price"?: string;
  multiplier?: number;
}
interface Account {
  accountNumber: string;
  nickname: string;
  balance: { data?: Balance } | null;
  positions: { data?: { items?: Position[] } } | null;
}

const n = (s?: string) => (s == null ? 0 : Number(s) || 0);

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{money0.format(value)}</div>
    </div>
  );
}

function PositionsTable({ items }: { items: Position[] }) {
  if (items.length === 0) {
    return <div className="feed-empty" style={{ padding: "8px 0" }}>Sin posiciones abiertas.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}>
            <th style={{ padding: "4px 6px" }}>Símbolo</th>
            <th style={{ padding: "4px 6px" }}>Lado</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Cant.</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Últ. precio</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => {
            const dir = p["quantity-direction"] ?? "";
            const isShort = dir.toLowerCase() === "short";
            return (
              <tr key={i} style={{ borderTop: "1px solid var(--border-soft)" }}>
                <td style={{ padding: "5px 6px", fontWeight: 600 }}>{p.symbol ?? p["underlying-symbol"] ?? "—"}</td>
                <td style={{ padding: "5px 6px", color: isShort ? "#f04438" : "#12b76a" }}>
                  {isShort ? "Corto" : "Largo"}
                </td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>{int.format(n(String(p.quantity)))}</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>${n(p["close-price"]).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TastytradeCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const c = await fetch("/api/tastytrade/connect").then((r) => r.json());
      setConnected(!!c.connected);
      if (!c.connected) { setLoading(false); return; }
      const d = await fetch("/api/tastytrade/accounts").then((r) => r.json());
      if (d.error) setErr(d.error);
      else setAccounts(d.accounts ?? []);
    } catch {
      setErr("No se pudo leer Tastytrade.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // No mostrar la tarjeta si nunca se conectó (evita ruido en la pantalla).
  if (connected === false) return null;

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="card-title">🍒 Tastytrade</div>
          <div className="card-sub">Tu capital y posiciones · solo lectura</div>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
          {loading ? "…" : "↻ Actualizar"}
        </button>
      </div>

      {err && <div className="error">⚠ {err}</div>}

      {accounts?.map((a) => {
        const b = a.balance?.data ?? {};
        const items = a.positions?.data?.items ?? [];
        return (
          <div key={a.accountNumber} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {a.nickname.trim() || a.accountNumber}
              <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}> · {a.accountNumber}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Metric label="Valor neto" value={n(b["net-liquidating-value"])} />
              <Metric label="Efectivo" value={n(b["cash-balance"])} />
              <Metric label="P. compra opciones" value={n(b["derivative-buying-power"])} />
              <Metric label="P. compra acciones" value={n(b["equity-buying-power"])} />
            </div>
            <PositionsTable items={items} />
          </div>
        );
      })}

      <div className="disclaimer">Datos de solo lectura. Nagimi no coloca órdenes en Tastytrade.</div>
    </section>
  );
}
