"use client";

// Panel de CONEXIONES — todos los servicios que necesitan login, su estado en
// vivo y cada cuánto caducan. Solo lectura de estado; no guarda credenciales aquí.

import { useCallback, useEffect, useState } from "react";

type Estado = "ok" | "bad" | "loading";

interface Conexion {
  key: string;
  nombre: string;
  dura: string;        // cuánto dura antes de pedir login
  auto: string;        // se renueva sola o no
  costo: string;       // pago mensual / por uso / gratis
  comoRenovar: string;
  check: () => Promise<Estado>;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try { return await fetch(url).then((r) => (r.ok ? r.json() : null)); } catch { return null; }
}

const CONEXIONES: Conexion[] = [
  {
    key: "marketsnack",
    nombre: "🍟 MarketSnack (flujo, GEX, radar)",
    dura: "~2–3 horas",
    auto: "Sí, si activaste el auto-login (abajo)",
    costo: "💰 Pago mensual (suscripción)",
    comoRenovar: "Auto-login 🤖 o pega la cookie (abajo)",
    check: async () => { const d = await getJson("/api/marketsnack-cookie"); return d?.valid ? "ok" : "bad"; },
  },
  {
    key: "massive",
    nombre: "📈 Massive (precios, cadena de opciones)",
    dura: "Sin caducidad (API key en .env.local)",
    auto: "—",
    costo: "💰 Pago mensual (plan de datos)",
    comoRenovar: "Renovar plan en su web; key en MASSIVE_API_KEY",
    check: async () => { const d = await getJson("/api/history?ticker=SPY"); const b = d?.bars; return Array.isArray(b) && b.length > 0 ? "ok" : "bad"; },
  },
  {
    key: "ms-login",
    nombre: "🤖 Auto-login MarketSnack",
    dura: "Permanente (hasta que cambies tu contraseña)",
    auto: "—",
    costo: "Gratis (usa tu cuenta MarketSnack)",
    comoRenovar: "Actívalo abajo con tu email + contraseña",
    check: async () => { const d = await getJson("/api/marketsnack-login"); return d?.hasLogin ? "ok" : "bad"; },
  },
  {
    key: "schwab",
    nombre: "🔵 Schwab (cuentas, posiciones)",
    dura: "~7 días (el acceso corto se refresca solo)",
    auto: "Sí, se auto-refresca ~7 días",
    costo: "Gratis (API del broker)",
    comoRenovar: "Reconectar en /schwab (OAuth)",
    check: async () => { const d = await fetch("/api/schwab/accounts").then((r) => r.json()).catch(() => null); return Array.isArray(d) ? "ok" : "bad"; },
  },
  {
    key: "tastytrade",
    nombre: "🍒 Tastytrade (capital, posiciones)",
    dura: "No caduca (el token de acceso de 15 min se renueva solo)",
    auto: "Sí, automático",
    costo: "Gratis (API del broker)",
    comoRenovar: "Crear un grant nuevo en my.tastytrade.com → API",
    check: async () => { const d = await getJson("/api/tastytrade/connect"); return d?.connected ? "ok" : "bad"; },
  },
  {
    key: "anthropic",
    nombre: "💬 IA del chat (Anthropic)",
    dura: "No caduca (hasta que rotes la key)",
    auto: "—",
    costo: "💵 Por uso (pagas lo que consumes, no fijo)",
    comoRenovar: "Pegar la API key en el chat de un ticker",
    check: async () => { const d = await getJson("/api/chat"); return d?.hasKey ? "ok" : "bad"; },
  },
];

function Dot({ e }: { e: Estado }) {
  const c = e === "ok" ? "#2ec77f" : e === "bad" ? "#ff5d52" : "var(--muted)";
  const t = e === "ok" ? "Activa" : e === "bad" ? "Inactiva / vencida" : "…";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: c, display: "inline-block" }} />
      <span style={{ color: c, fontSize: 12.5, fontWeight: 600 }}>{t}</span>
    </span>
  );
}

export default function ConexionesCard() {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setEstados(Object.fromEntries(CONEXIONES.map((c) => [c.key, "loading"])));
    const entries = await Promise.all(CONEXIONES.map(async (c) => [c.key, await c.check()] as const));
    setEstados(Object.fromEntries(entries));
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🔌 Conexiones</div>
          <div className="card-sub">Todo lo que pide login, su estado y cada cuánto caduca.</div>
        </div>
        <button type="button" onClick={load} disabled={busy}
          style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>
          {busy ? "…" : "↻ Revisar"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Servicio</th>
              <th style={{ padding: "6px 8px" }}>Estado</th>
              <th style={{ padding: "6px 8px" }}>Costo</th>
              <th style={{ padding: "6px 8px" }}>Dura</th>
              <th style={{ padding: "6px 8px" }}>Cómo renovar</th>
            </tr>
          </thead>
          <tbody>
            {CONEXIONES.map((c) => (
              <tr key={c.key} style={{ borderTop: "1px solid var(--border-soft)" }}>
                <td style={{ padding: "8px", fontWeight: 600 }}>{c.nombre}</td>
                <td style={{ padding: "8px" }}><Dot e={estados[c.key] ?? "loading"} /></td>
                <td style={{ padding: "8px", color: c.costo.startsWith("💰") ? "#f5c451" : "var(--muted)", fontWeight: c.costo.startsWith("💰") ? 600 : 400 }}>{c.costo}</td>
                <td style={{ padding: "8px", color: "var(--muted)" }}>{c.dura}</td>
                <td style={{ padding: "8px", color: "var(--muted)" }}>{c.comoRenovar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
        🟢 = lista para usar · 🔴 = necesita que la renueves. Todas guardan sus datos solo en tu PC.
      </div>
    </section>
  );
}
