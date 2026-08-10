"use client";

// Mis posiciones — Schwab (automático, solo lectura) + posiciones MANUALES
// (Robinhood u otro broker que no tiene API). Cada opción se desglosa y se
// analiza con un clic. Las manuales se guardan en localStorage.

import { useCallback, useEffect, useState } from "react";
import { parseOcc } from "@/lib/occ";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const LS_MANUAL = "nagimi.manualPos";

interface Instrument { symbol?: string; assetType?: string; putCall?: string }
interface Position {
  instrument?: Instrument;
  longQuantity?: number; shortQuantity?: number;
  marketValue?: number; averagePrice?: number;
  currentDayProfitLoss?: number; longOpenProfitLoss?: number; shortOpenProfitLoss?: number;
}
interface Account {
  securitiesAccount?: {
    accountNumber?: string; type?: string;
    currentBalances?: { cashBalance?: number; buyingPower?: number; cashAvailableForTrading?: number };
    positions?: Position[];
  };
}
interface ManualPos { broker: string; ticker: string; side: "compré" | "vendí"; type: "call" | "put" | "acción"; strike: string; expiry: string; qty: string; cost: string }

const pl = (n?: number | null) => (n == null ? null : <span style={{ color: n >= 0 ? "#4ad991" : "#ff8a82", fontWeight: 600 }}>{n >= 0 ? "+" : ""}{money.format(n)}</span>);
const field: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 12.5 };
const th: React.CSSProperties = { textAlign: "left", fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", padding: "5px 7px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { fontSize: 12.5, padding: "6px 7px", borderTop: "1px solid var(--border-soft)" };

const EMPTY: ManualPos = { broker: "Robinhood", ticker: "", side: "compré", type: "call", strike: "", expiry: "", qty: "1", cost: "" };
const netCost = (legs: ManualPos[]) => legs.reduce((s, m) => s + (m.side === "vendí" ? -1 : 1) * (parseFloat(m.cost) || 0), 0);

export default function MisPosicionesCard({ onPick }: { onPick: (ticker: string) => void }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState<ManualPos[]>([]);
  const [mLoaded, setMLoaded] = useState(false);
  const [draft, setDraft] = useState<ManualPos>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const r = await fetch("/api/schwab/accounts").then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    if (Array.isArray(r)) setAccounts(r);
    else setErr(r?.error ?? "No conectado.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try { const raw = localStorage.getItem(LS_MANUAL); if (raw) setManual(JSON.parse(raw)); } catch {}
    setMLoaded(true);
  }, []);
  useEffect(() => { if (mLoaded) { try { localStorage.setItem(LS_MANUAL, JSON.stringify(manual)); } catch {} } }, [manual, mLoaded]);

  // Cotización en vivo de cada pata manual (precio real de la cadena) para el P/L.
  const [quotes, setQuotes] = useState<Record<string, number | null>>({});
  const [quoting, setQuoting] = useState(false);
  const keyOf = (m: ManualPos) => `${m.ticker}|${m.type}|${m.strike}|${m.expiry}`;
  const loadQuotes = useCallback(async () => {
    const legs = manual.filter((m) => m.type !== "acción" && m.strike && m.expiry);
    if (legs.length === 0) return;
    setQuoting(true);
    const uniq = [...new Map(legs.map((m) => [keyOf(m), m])).values()];
    const results = await Promise.all(uniq.map(async (m) => {
      const url = `/api/quote?ticker=${encodeURIComponent(m.ticker)}&type=${m.type}&strike=${m.strike}&expiration=${encodeURIComponent(m.expiry)}`;
      const q = await fetch(url).then((x) => x.json()).catch(() => null);
      return [keyOf(m), q && !q.error && typeof q.mid === "number" ? q.mid : null] as const;
    }));
    setQuotes((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    setQuoting(false);
  }, [manual]);
  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  // Valor de mercado y P/L de una pata (según lo que costó y su lado).
  const legLive = (m: ManualPos) => {
    const mid = quotes[keyOf(m)];
    if (mid == null || m.type === "acción") return null;
    return mid * 100 * (parseFloat(m.qty) || 0);
  };
  const legPL = (m: ManualPos) => {
    const live = legLive(m);
    if (live == null) return null;
    const cost = parseFloat(m.cost) || 0;
    return m.side === "compré" ? live - cost : cost - live; // compré: gano si sube; vendí: gano si baja
  };

  const addManual = () => {
    if (!draft.ticker.trim()) return;
    setManual((p) => [...p, { ...draft, ticker: draft.ticker.trim().toUpperCase() }]);
    setDraft(EMPTY);
  };
  const delManual = (i: number) => setManual((p) => p.filter((_, idx) => idx !== i));

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>💼 Mis posiciones</div>
          <div className="card-sub">Schwab (automático) + las que agregues a mano (Robinhood u otro). Análisis a un clic.</div>
        </div>
        <button type="button" onClick={load} disabled={loading} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>
          {loading ? "Leyendo…" : "🔄 Actualizar"}
        </button>
      </div>

      {/* --- Schwab automático --- */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>🔵 Schwab (thinkorswim) — automático</div>
      {err && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>⚠ {err} — <a href="/schwab" style={{ color: "var(--accent)", fontWeight: 600 }}>Conectar / reconectar →</a></div>
      )}
      {accounts?.map((a, i) => {
        const s = a.securitiesAccount ?? {};
        const acct = s.accountNumber ? "••••" + s.accountNumber.slice(-4) : `Cuenta ${i + 1}`;
        const positions = s.positions ?? [];
        if (positions.length === 0) return null;
        // Agrupa por subyacente para sumar spreads (varias patas del mismo ticker).
        const groups = new Map<string, Position[]>();
        for (const p of positions) {
          const occ = parseOcc((p.instrument?.symbol ?? "").replace(/\s+/g, ""));
          const key = occ?.underlying ?? p.instrument?.symbol ?? "?";
          const arr = groups.get(key) ?? [];
          arr.push(p);
          groups.set(key, arr);
        }
        return (
          <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{acct} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {s.type}</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {[...groups.entries()].map(([ticker, legs]) => {
                const isSpread = legs.length > 1;
                const netVal = legs.reduce((x, p) => x + (p.marketValue ?? 0), 0);
                const netPL = legs.reduce((x, p) => x + (p.longOpenProfitLoss ?? p.shortOpenProfitLoss ?? 0), 0);
                const netDay = legs.reduce((x, p) => x + (p.currentDayProfitLoss ?? 0), 0);
                return (
                  <div key={ticker} style={{ background: "var(--panel)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onPick(ticker)} style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{ticker} ⤴</button>
                      {isSpread && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>🔗 Spread · {legs.length} patas</span>}
                      <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12 }}>
                        <span style={{ color: "var(--muted)" }}>Valor <b style={{ color: "var(--text)" }}>{money.format(netVal)}</b></span>
                        <span style={{ color: "var(--muted)" }}>{isSpread ? "P/L neto" : "P/L"} {pl(netPL)}</span>
                        {netDay !== 0 && <span style={{ color: "var(--muted)" }}>hoy {pl(netDay)}</span>}
                      </span>
                    </div>
                    <div style={{ marginTop: isSpread ? 6 : 3 }}>
                      {legs.map((p, j) => {
                        const occ = parseOcc((p.instrument?.symbol ?? "").replace(/\s+/g, ""));
                        const qty = (p.longQuantity ?? 0) - (p.shortQuantity ?? 0);
                        return (
                          <div key={j} style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)", padding: "3px 0", borderTop: j ? "1px solid var(--border-soft)" : "none" }}>
                            {occ
                              ? <span style={{ color: occ.type === "call" ? "#4ad991" : "#ff8a82", fontWeight: 600 }}>{qty > 0 ? `+${qty}` : qty} {occ.type === "call" ? "CALL" : "PUT"} ${occ.strike} · {occ.expiration}</span>
                              : <span>{p.instrument?.symbol} × {qty}</span>}
                            {p.averagePrice != null && <span>costo {money.format(p.averagePrice)}</span>}
                            {!isSpread && p.marketValue != null && <span style={{ marginLeft: "auto" }}>valor {money.format(p.marketValue)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {accounts && !accounts.some((a) => (a.securitiesAccount?.positions?.length ?? 0) > 0) && !err && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Sin posiciones abiertas en Schwab.</div>
      )}

      {/* --- Manuales (Robinhood u otro) --- */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>🟣 Manuales (Robinhood u otro broker)</div>
      {[...new Map(manual.map((m) => [m.ticker, manual.filter((x) => x.ticker === m.ticker)])).entries()].map(([ticker, legs]) => {
        const isSpread = legs.length > 1;
        const net = netCost(legs);
        const optionLegs = legs.filter((l) => l.type !== "acción");
        const priced = optionLegs.length > 0 && optionLegs.every((l) => quotes[keyOf(l)] != null);
        const netLive = priced ? optionLegs.reduce((s, l) => s + (legLive(l) ?? 0), 0) : null;
        const netPL = priced ? legs.reduce((s, l) => s + (legPL(l) ?? 0), 0) : null;
        return (
          <div key={ticker} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => onPick(ticker)} style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{ticker} ⤴</button>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{legs[0].broker}{isSpread ? ` · 🔗 Spread · ${legs.length} patas` : ""}{quoting ? " · cotizando…" : ""}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
                {(net !== 0 || legs.some((l) => l.cost)) && (
                  <span style={{ color: "var(--muted)" }}>{isSpread ? "Costo neto" : "Costo"} <b style={{ color: net >= 0 ? "#ff8a82" : "#4ad991" }}>{money.format(Math.abs(net))} {net >= 0 ? "(débito)" : "(crédito)"}</b></span>
                )}
                {netLive != null && <span style={{ color: "var(--muted)" }}>Valor <b style={{ color: "var(--text)" }}>{money.format(netLive)}</b></span>}
                {netPL != null && <span style={{ color: "var(--muted)" }}>{isSpread ? "P/L neto" : "P/L"} {pl(netPL)}</span>}
              </span>
            </div>
            <div style={{ marginTop: isSpread ? 6 : 3 }}>
              {legs.map((m, j) => {
                const gi = manual.indexOf(m);
                return (
                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)", padding: "3px 0", borderTop: j ? "1px solid var(--border-soft)" : "none" }}>
                    <span style={{ fontWeight: 700, color: m.side === "compré" ? "#4ad991" : "#ff8a82" }}>{m.side === "compré" ? "COMPRÉ" : "VENDÍ"}</span>
                    {m.type !== "acción"
                      ? <span style={{ color: m.type === "call" ? "#4ad991" : "#ff8a82", fontWeight: 600 }}>{m.qty}× {m.type === "call" ? "CALL" : "PUT"} ${m.strike}{m.expiry ? ` · ${m.expiry}` : ""}</span>
                      : <span>{m.qty}× acción</span>}
                    {m.cost && <span>costo ${m.cost}</span>}
                    {legPL(m) != null && <span style={{ marginLeft: "auto" }}>P/L {pl(legPL(m))}</span>}
                    <button type="button" onClick={() => delManual(gi)} style={{ marginLeft: legPL(m) != null ? 8 : "auto", background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "1px 7px", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Formulario para agregar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 10 }}>
        <input style={{ ...field, width: 110 }} placeholder="Broker" value={draft.broker} onChange={(e) => setDraft({ ...draft, broker: e.target.value })} />
        <input style={{ ...field, width: 80 }} placeholder="Ticker" value={draft.ticker} onChange={(e) => setDraft({ ...draft, ticker: e.target.value })} />
        <select style={{ ...field }} value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value as ManualPos["side"] })}>
          <option value="compré">Compré</option><option value="vendí">Vendí</option>
        </select>
        <select style={{ ...field }} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ManualPos["type"] })}>
          <option value="call">CALL</option><option value="put">PUT</option><option value="acción">Acción</option>
        </select>
        {draft.type !== "acción" && <input style={{ ...field, width: 70 }} placeholder="Strike" value={draft.strike} onChange={(e) => setDraft({ ...draft, strike: e.target.value })} />}
        {draft.type !== "acción" && <input type="date" style={{ ...field }} value={draft.expiry} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} />}
        <input style={{ ...field, width: 60 }} placeholder="Cant." value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
        <input style={{ ...field, width: 80 }} placeholder="Costo $" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
        <button type="button" onClick={addManual} style={{ background: "#2ec77f", color: "#062", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>+ Agregar</button>
      </div>

      <div className="disclaimer">Solo lectura y seguimiento. Nagimi no ejecuta órdenes. No es consejo financiero.</div>
    </section>
  );
}
