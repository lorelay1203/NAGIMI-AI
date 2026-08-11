"use client";

// Envío semi-automático: Nagimi arma la orden, Tastytrade la revisa (dry-run)
// y solo un clic explícito de la usuaria la envía de verdad.

import { useEffect, useState } from "react";
import type { OrderLegInput } from "@/lib/tastytrade";
import { px } from "../format";

const money = (n: number) => "$" + px.format(Math.abs(n));

interface Outcome {
  sent: boolean;
  buyingPowerEffect: number | null;
  fees: number | null;
  warnings: string[];
  status: string | null;
  orderId: string | null;
}

interface Account {
  accountNumber: string;
  nickname: string;
}

const btn: React.CSSProperties = {
  border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13,
};

export default function SendToTastytrade({
  ticker, expiration, legs, price, priceEffect,
}: {
  ticker: string;
  expiration: string;
  legs: OrderLegInput[];
  price: number;
  priceEffect: "Debit" | "Credit";
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [account, setAccount] = useState("");
  const [review, setReview] = useState<Outcome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    fetch("/api/tastytrade/accounts")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setAccounts([]); return; }
        const list: Account[] = (j.accounts ?? []).map((a: Account) => ({ accountNumber: a.accountNumber, nickname: a.nickname }));
        setAccounts(list);
        if (list.length > 0) setAccount(list[0].accountNumber);
      })
      .catch(() => setAccounts([]));
  }, []);

  // Cualquier cambio en la orden invalida la revisión anterior.
  useEffect(() => { setReview(null); setAck(false); setErr(null); }, [ticker, expiration, price, priceEffect, legs]);

  async function send(confirm: boolean) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/tastytrade/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountNumber: account, underlying: ticker, expiration, legs, price, priceEffect, confirm }),
    }).then((x) => x.json()).catch(() => ({ error: "Fallo de red." }));
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setReview(r as Outcome);
  }

  if (accounts !== null && accounts.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Tastytrade no está conectado, así que no se puede enviar la orden desde aquí.
      </div>
    );
  }

  const done = review?.sent === true;

  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>📤 Enviar a Tastytrade</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>Cuenta</label>
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "7px 10px", fontSize: 13 }}
        >
          {(accounts ?? []).map((a) => (
            <option key={a.accountNumber} value={a.accountNumber}>{a.nickname} · {a.accountNumber}</option>
          ))}
        </select>
        <button type="button" onClick={() => send(false)} disabled={busy || !account}
          style={{ ...btn, background: "var(--accent)", color: "#fff" }}>
          {busy && !review ? "Revisando…" : "🔍 Revisar en Tastytrade"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Orden: <b style={{ color: "var(--text)" }}>{legs.length} pata{legs.length === 1 ? "" : "s"}</b> de {ticker} · vence {expiration || "—"} ·
        límite neto {money(price)} ({priceEffect === "Debit" ? "pagas" : "recibes"}) · válida solo hoy.
      </div>

      {err && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--red-bg)", border: "1px solid rgba(255,93,82,0.4)", color: "#ff9b94", fontSize: 12.5 }}>
          ⚠️ {err}
        </div>
      )}

      {review && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>PODER DE COMPRA</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{review.buyingPowerEffect != null ? money(review.buyingPowerEffect) : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>COMISIONES</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{review.fees != null ? money(review.fees) : "—"}</div>
            </div>
            {review.status && (
              <div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>ESTADO</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{review.status}</div>
              </div>
            )}
          </div>

          {review.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--amber-text)" }}>⚠ {w}</div>
          ))}

          {done ? (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--green-bg)", border: "1px solid rgba(46,199,127,0.4)", color: "#4ad991", fontWeight: 700, fontSize: 13 }}>
              ✅ Orden enviada{review.orderId ? ` · #${review.orderId}` : ""}. Revísala en Tastytrade para confirmar el llenado.
            </div>
          ) : (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                Revisé los números y quiero enviar esta orden con dinero real.
              </label>
              <button type="button" onClick={() => send(true)} disabled={busy || !ack}
                style={{ ...btn, background: ack ? "#2ec77f" : "var(--panel)", color: ack ? "#062" : "var(--muted)", cursor: ack ? "pointer" : "not-allowed", alignSelf: "flex-start" }}>
                {busy ? "Enviando…" : "🚀 Enviar orden ahora"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
