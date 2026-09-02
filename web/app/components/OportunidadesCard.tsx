"use client";

/**
 * 🎯 Oportunidades de hoy — el diario en papel, pero mirando hacia ADELANTE:
 * qué pasaría si entras ahora, cuánto tiempo queda, y en cuál de tus cuentas
 * reales te alcanza el dinero. Lo vencido y lo que ya corrió se aparta.
 */
import { useCallback, useEffect, useState } from "react";

interface Encaje { cabe: boolean; contratosPosibles: number; resumen: string }
interface Oportunidad {
  id: string; ticker: string; label: string; expiration: string | null; dias: number;
  estado: "entrable" | "ya_corrio" | "vencido" | "sin_precio";
  motivo: string; netoAhora: number | null; netoOriginal: number;
  desembolso: number | null; maxGanancia: number | null; maxPerdida: number | null;
  pop: number | null; breakevens: number[]; alertar: boolean; encaje: Encaje | null;
}
interface Cuenta { brokerNombre: string; cuenta: string; disponible: number }
interface Resp {
  error?: string; hoy?: string;
  saldos?: { cuentas: Cuenta[]; total: number; problemas: { brokerNombre: string; motivo: string }[] };
  oportunidades?: Oportunidad[];
  resumen?: { total: number; entrables: number; alcanzan: number; vencidas: number; yaCorrieron: number };
}

const ESTADO: Record<Oportunidad["estado"], { txt: string; c: string }> = {
  entrable:   { txt: "Se puede entrar", c: "#12b76a" },
  ya_corrio:  { txt: "Ya corrió",       c: "#7a8699" },
  vencido:    { txt: "Vencida",         c: "#7a8699" },
  sin_precio: { txt: "Sin precio",      c: "#e0a800" },
};

export default function OportunidadesCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetch("/api/paper-opportunities").then((r) => r.json()));
    } catch {
      setData({ error: "No se pudieron cargar las oportunidades." });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const todas = data?.oportunidades ?? [];
  // Por defecto solo lo accionable: lo vencido y lo que ya corrió estorba.
  const lista = verTodas ? todas : todas.filter((o) => o.estado === "entrable");
  const r = data?.resumen;
  const conAlerta = todas.filter((o) => o.estado === "entrable" && o.encaje?.cabe);

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>🎯 Oportunidades de hoy</div>
        <button type="button" onClick={load} disabled={loading}
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "5px 11px", fontSize: 12, cursor: "pointer", color: "var(--text)" }}>
          {loading ? "Mirando…" : "↻ Actualizar"}
        </button>
      </div>

      {data?.error && <div style={{ fontSize: 12.5, color: "#f04438" }}>⚠️ {data.error}</div>}

      {/* Dinero real disponible */}
      {data?.saldos && (
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "9px 12px" }}>
          <div style={{ fontSize: 12.5 }}>
            💵 Tienes <b style={{ color: "#12b76a" }}>${data.saldos.total.toFixed(2)}</b> disponibles
            {data.saldos.cuentas.filter((c) => c.disponible > 0).map((c) => (
              <span key={c.cuenta} style={{ color: "var(--muted)" }}> · {c.brokerNombre} {c.cuenta}: ${c.disponible.toFixed(2)}</span>
            ))}
          </div>
          {data.saldos.problemas.map((p) => (
            <div key={p.brokerNombre} style={{ fontSize: 11, color: "#e0a800", marginTop: 4 }}>
              ⚠️ {p.brokerNombre} no se pudo leer — {p.motivo}
            </div>
          ))}
        </div>
      )}

      {/* Alerta: lo que puedes hacer AHORA */}
      {conAlerta.length > 0 && (
        <div style={{ background: "#12b76a12", border: "1px solid #12b76a55", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5 }}>
          🔔 <b>{conAlerta.length} {conAlerta.length === 1 ? "oportunidad te alcanza" : "oportunidades te alcanzan"} ahora mismo</b> —
          la más próxima vence en {Math.min(...conAlerta.map((o) => o.dias))} día(s). Aún hay tiempo de entrar.
        </div>
      )}

      {r && (
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {r.entrables} se pueden entrar · <b style={{ color: "#12b76a" }}>{r.alcanzan} te alcanzan</b> ·
          {" "}{r.yaCorrieron} ya corrieron · {r.vencidas} vencidas
          {" · "}
          <button type="button" onClick={() => setVerTodas((v) => !v)}
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5, padding: 0, textDecoration: "underline" }}>
            {verTodas ? "ocultar las que no sirven" : "ver todas"}
          </button>
        </div>
      )}

      {!loading && lista.length === 0 && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
          No hay oportunidades entrables ahora mismo. Cuando el motor encuentre nuevas, aparecen aquí.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.slice(0, 25).map((o) => {
          const e = ESTADO[o.estado];
          const cabe = o.encaje?.cabe ?? false;
          return (
            <div key={o.id} style={{
              border: `1px solid ${cabe ? "#12b76a55" : "var(--border-soft)"}`,
              background: cabe ? "#12b76a08" : "var(--panel-2)",
              borderRadius: 10, padding: "10px 12px", opacity: o.estado === "entrable" ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {o.ticker} <span style={{ fontWeight: 500, color: "var(--muted)" }}>{o.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: e.c, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {e.txt}{o.expiration ? ` · ${o.dias}d` : ""}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{o.motivo}</div>

              {o.desembolso != null && o.estado === "entrable" && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 7, fontSize: 12 }}>
                  <span>Pones <b>${o.desembolso.toFixed(0)}</b></span>
                  <span style={{ color: "#12b76a" }}>Ganas hasta <b>${(o.maxGanancia ?? 0).toFixed(0)}</b></span>
                  <span style={{ color: "#f04438" }}>Pierdes hasta <b>${Math.abs(o.maxPerdida ?? 0).toFixed(0)}</b></span>
                  {o.pop != null && <span style={{ color: o.pop >= 70 ? "#12b76a" : "var(--muted)" }}>Prob. <b>{o.pop.toFixed(0)}%</b></span>}
                </div>
              )}

              {o.encaje && (
                <div style={{ fontSize: 11.5, marginTop: 6, color: cabe ? "#12b76a" : "#e0a800", lineHeight: 1.45 }}>
                  {cabe ? "✅ " : "🚫 "}{o.encaje.resumen}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Todo esto es <b>simulado</b>: son ideas del motor en papel, valoradas a precio de ahora.
        Nagimi nunca envía órdenes solo — tú decides y ejecutas.
      </div>
    </section>
  );
}
