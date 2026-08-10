"use client";

// Fase 1 — Conexión de SOLO LECTURA con Schwab (thinkorswim).
// Login OAuth (tú te logueas en Schwab, la app nunca ve tu contraseña) y muestra
// tu cuenta y posiciones. NO coloca órdenes.

import { useEffect, useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

interface Position {
  instrument?: { symbol?: string; assetType?: string };
  longQuantity?: number;
  shortQuantity?: number;
  marketValue?: number;
}
interface Account {
  securitiesAccount?: {
    accountNumber?: string;
    type?: string;
    currentBalances?: { liquidationValue?: number; cashBalance?: number; buyingPower?: number };
    positions?: Position[];
  };
}

export default function SchwabPage() {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [redirect, setRedirect] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  async function loadStatus() {
    const r = await fetch("/api/schwab/authurl").then((x) => x.json()).catch(() => null);
    if (!r) return;
    if (r.error) { setCfgError(r.error); return; }
    setAuthUrl(r.url);
    setConnected(Boolean(r.connected));
    if (r.connected) loadAccounts();
  }
  async function loadAccounts() {
    const r = await fetch("/api/schwab/accounts").then((x) => x.json()).catch(() => null);
    if (Array.isArray(r)) setAccounts(r);
    else if (r?.error) {
      // El token guardado caducó → volver a mostrar el formulario para reconectar.
      setMsg("⚠ " + r.error);
      setConnected(false);
    }
  }
  useEffect(() => { loadStatus(); }, []);

  async function connect() {
    if (!redirect.trim()) { setMsg("Pega la URL de retorno de Schwab."); return; }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/schwab/connect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect }),
    }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    setBusy(false);
    if (r.ok) { setConnected(true); setMsg("✓ Conectado."); loadAccounts(); }
    else setMsg("⚠ " + (r.error ?? "No se pudo conectar."));
  }

  return (
    <main className="wrap page-stack" style={{ maxWidth: 760 }}>
      <div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Conexión con Schwab (thinkorswim)</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Fase 1 — <b>solo lectura</b>. Muestra tu cuenta y posiciones. No coloca órdenes.
        </p>
      </div>

      {cfgError && (
        <div className="error">
          ⚠ {cfgError}<br />
          Pon <code>SCHWAB_CLIENT_ID</code> y <code>SCHWAB_CLIENT_SECRET</code> en <code>web\.env.local</code> y reinicia.
        </div>
      )}

      {!cfgError && !connected && (
        <section className="card" style={{ gap: 14 }}>
          <div style={{ fontWeight: 700 }}>Conectar tu cuenta</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text)", lineHeight: 1.7 }}>
            <li>
              Haz clic en <b>Iniciar sesión en Schwab</b> (abre una pestaña nueva) e inicia sesión + autoriza.
              {authUrl && (
                <>
                  {" "}
                  <a href={authUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>
                    → Iniciar sesión en Schwab
                  </a>
                </>
              )}
            </li>
            <li>Al terminar te mandará a una página que <b>parece un error</b> (127.0.0.1:8182). Es normal.</li>
            <li>Copia la <b>URL completa</b> de la barra de direcciones de esa página.</li>
            <li>Pégala aquí abajo y pulsa <b>Conectar</b>.</li>
          </ol>
          <input
            value={redirect}
            onChange={(e) => setRedirect(e.target.value)}
            placeholder="Pega aquí la URL https://127.0.0.1:8182/?code=..."
            spellCheck={false}
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", padding: "12px 14px", fontSize: 13 }}
          />
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}
          >
            {busy ? "Conectando…" : "Conectar"}
          </button>
          {msg && <div style={{ color: "var(--muted)" }}>{msg}</div>}
        </section>
      )}

      {connected && (
        <section className="card" style={{ gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Tu cuenta Schwab</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#4ad991", border: "1px solid #2ec77f", borderRadius: 999, padding: "2px 8px" }}>SOLO LECTURA</span>
          </div>
          {!accounts && <div style={{ color: "var(--muted)" }}>Leyendo tu cuenta…</div>}
          {accounts?.map((a, i) => {
            const s = a.securitiesAccount ?? {};
            const b = s.currentBalances ?? {};
            const acct = s.accountNumber ? "••••" + s.accountNumber.slice(-4) : `Cuenta ${i + 1}`;
            return (
              <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>{acct} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {s.type ?? ""}</span></div>
                  <div style={{ fontWeight: 700 }}>{b.liquidationValue != null ? money.format(b.liquidationValue) : "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
                  <span>Efectivo: <b style={{ color: "var(--text)" }}>{b.cashBalance != null ? money.format(b.cashBalance) : "—"}</b></span>
                  <span>Poder de compra: <b style={{ color: "var(--text)" }}>{b.buyingPower != null ? money.format(b.buyingPower) : "—"}</b></span>
                </div>
                {s.positions && s.positions.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Posiciones</div>
                    {s.positions.map((p, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", borderTop: j ? "1px solid var(--border-soft)" : "none" }}>
                        <span>{p.instrument?.symbol ?? "?"} <span style={{ color: "var(--muted)" }}>× {(p.longQuantity ?? 0) - (p.shortQuantity ?? 0)}</span></span>
                        <span style={{ color: "var(--text)" }}>{p.marketValue != null ? money.format(p.marketValue) : "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {msg && <div style={{ color: "var(--muted)" }}>{msg}</div>}
          <div className="disclaimer">Conexión de solo lectura con la API oficial de Schwab. No se colocan órdenes.</div>
        </section>
      )}
    </main>
  );
}
