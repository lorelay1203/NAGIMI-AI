"use client";

// Renovar cookie de MarketSnack — sin Claude, sin tocar archivos, sin reiniciar.
// Pega la cookie de app.marketsnack.com, pulsa Guardar, y la app la usa al instante.

import { useEffect, useState } from "react";
import ConexionesCard from "../components/ConexionesCard";

export default function CookiePage() {
  const [status, setStatus] = useState<{ hasCookie: boolean; valid: boolean } | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Auto-login (headless): guarda email+contraseña y renueva la cookie sola.
  const [hasLogin, setHasLogin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  const loadStatus = () => fetch("/api/marketsnack-cookie").then((r) => r.json()).then(setStatus).catch(() => {});
  const loadLogin = () => fetch("/api/marketsnack-login").then((r) => r.json()).then((d) => setHasLogin(!!d.hasLogin)).catch(() => {});
  useEffect(() => { loadStatus(); loadLogin(); }, []);

  async function activarAuto() {
    if (!email.trim() || !pass) { setAutoMsg("Escribe tu email y contraseña de MarketSnack."); return; }
    setAutoBusy(true); setAutoMsg("Iniciando sesión en MarketSnack (tarda ~15-30s)…");
    const r = await fetch("/api/marketsnack-login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: pass }),
    }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    setAutoBusy(false);
    if (r.ok) { setAutoMsg("✅ ¡Auto-login activado! La cookie se renovará sola cuando caduque."); setPass(""); loadStatus(); loadLogin(); }
    else setAutoMsg("⚠ " + (r.error ?? "No se pudo iniciar sesión."));
  }

  async function probarAuto() {
    setAutoBusy(true); setAutoMsg("Renovando con tus credenciales guardadas…");
    const r = await fetch("/api/marketsnack-login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "relogin" }),
    }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    setAutoBusy(false);
    setAutoMsg(r.ok ? "✅ Cookie renovada automáticamente." : "⚠ " + (r.error ?? "Falló la renovación."));
    loadStatus();
  }

  async function save() {
    if (!value.trim()) { setMsg("Pega la cookie primero."); return; }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/marketsnack-cookie", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie: value }),
    }).then((x) => x.json()).catch(() => ({ error: "Fallo de red" }));
    setBusy(false);
    if (r.error) { setMsg("⚠ " + r.error); return; }
    if (r.valid) { setMsg("✅ ¡Cookie válida y guardada! Ya puedes volver a analizar tickers."); setValue(""); }
    else { setMsg("⚠ Se guardó, pero MarketSnack la rechazó. Asegúrate de estar con sesión iniciada y copia una fresca."); }
    loadStatus();
  }

  const badge = status == null
    ? { t: "Comprobando…", c: "var(--muted)", b: "var(--border)" }
    : status.valid
    ? { t: "✓ Cookie activa", c: "#4ad991", b: "#2ec77f" }
    : { t: "✗ Cookie vencida o ausente", c: "#ff8a82", b: "#ff5d52" };

  return (
    <main className="wrap page-stack" style={{ maxWidth: 720 }}>
      <div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
        <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>🍪 Renovar cookie de MarketSnack</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          La cookie de MarketSnack caduca cada pocas horas. Renuévala aquí — se aplica al instante, sin reiniciar nada.
        </p>
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: badge.c, border: `1px solid ${badge.b}`, borderRadius: 999, padding: "3px 12px" }}>{badge.t}</span>
        <button type="button" onClick={loadStatus} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontSize: 12 }}>Volver a probar</button>
      </div>

      <ConexionesCard />

      {/* Auto-login: lo recomendado. Renueva la cookie sola. */}
      <section className="card" style={{ gap: 12, border: "1px solid #2ec77f55" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🤖 Auto-renovar (recomendado)</div>
          <div className="card-sub">
            Guarda tu acceso una vez y Nagimi renueva la cookie <b>sola</b> cuando caduque. No más copiar/pegar.
            {hasLogin && <span style={{ color: "#4ad991" }}> · ✓ Auto-login activo</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email de MarketSnack" type="email" autoComplete="off" spellCheck={false}
            style={{ flex: 1, minWidth: 200, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "9px 11px", fontSize: 13.5 }} />
          <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Contraseña" type="password" autoComplete="off"
            style={{ flex: 1, minWidth: 200, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "9px 11px", fontSize: 13.5 }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={activarAuto} disabled={autoBusy}
            style={{ background: "#2ec77f", color: "#04140c", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {autoBusy ? "Trabajando…" : hasLogin ? "Actualizar acceso" : "Activar auto-login"}
          </button>
          {hasLogin && (
            <button type="button" onClick={probarAuto} disabled={autoBusy}
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13.5 }}>
              ↻ Renovar ahora
            </button>
          )}
        </div>
        {autoMsg && <div style={{ color: "var(--text)", fontSize: 13.5 }}>{autoMsg}</div>}
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
          🔒 Tu email y contraseña se guardan <b>solo en tu PC</b> (<code>data\marketsnack_login.json</code>, fuera de git). Nagimi los usa únicamente para iniciar sesión en MarketSnack y leer datos.
        </div>
      </section>

      <section className="card" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>✍️ Manual (alternativa) — Pasos (30 segundos)</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text)", lineHeight: 1.7, fontSize: 14 }}>
          <li>Abre <b>app.marketsnack.com</b> en Chrome (con sesión iniciada, que veas datos).</li>
          <li>Pulsa <b>F12</b> → pestaña <b>Network</b> → en el filtro escribe <b>api</b> → recarga con <b>F5</b>.</li>
          <li>Clic en cualquier petición a <code>app.marketsnack.com/api/...</code> → <b>clic derecho → Copy → Copy request headers</b>.</li>
          <li>Pega todo aquí abajo (yo saco lo que necesito) y pulsa <b>Guardar y probar</b>.</li>
        </ol>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pega aquí los request headers (o solo la línea que empieza con Cookie: ... que incluya _market_snack_session=...)"
          spellCheck={false}
          style={{ minHeight: 130, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", padding: 12, fontSize: 12.5, fontFamily: "monospace", resize: "vertical" }}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 700, cursor: "pointer", alignSelf: "flex-start", fontSize: 14 }}
        >
          {busy ? "Guardando y probando…" : "Guardar y probar"}
        </button>
        {msg && <div style={{ color: "var(--text)", fontSize: 13.5 }}>{msg}</div>}
      </section>

      <div className="disclaimer">
        Tu cookie se guarda solo en tu PC (<code>web\data\marketsnack_cookie.txt</code>). No se comparte. Trátala como una contraseña.
      </div>
    </main>
  );
}
