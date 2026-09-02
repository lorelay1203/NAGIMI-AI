"use client";

/**
 * 🎟️ Ticket del día: la idea del GEX traducida a UN contrato concreto, con lo
 * que cuesta, lo que se gana si acierta y lo que se pierde si toca el stop —
 * todo en dólares, y como % de la cuenta.
 */
import { useCallback, useEffect, useState } from "react";

interface Ticket {
  strike: number; type: "call" | "put"; expiration: string | null; symbol: string | null;
  bid: number; ask: number; mid: number; delta: number; gamma: number; iv: number | null;
  volume: number; oi: number; spreadPct: number;
  targetPx: number; stopPx: number; rbOption: number;
  cost: number; risk: number; gain: number; gainPct: number; lossPct: number;
  riskPctOfCapital: number | null; costPctOfCapital: number | null;
  approxPop: number; warning: string | null;
}
interface Setup { direction: "long" | "short"; entry: number; target: number; stop: number; reason: string; rr: number }
interface Verdict { status: "ready" | "wait"; reason: string; rr: number }
interface Resp {
  error?: string;
  levels?: { spot: number; magnet: number | null; regime: string; source: string };
  setup?: Setup | null; verdict?: Verdict | null; ticket?: Ticket | null;
  ticketReason?: string | null; noSetup?: string; expiration?: string | null;
  chainSource?: string | null; simulated?: boolean;
  flujoRevisado?: boolean; flujoPremium?: number;
  flujoFuente?: string | null; flujoVelocidad?: number | null;
}

const money = (n: number) => `$${n >= 1000 ? Math.round(n).toLocaleString("es") : n.toFixed(0)}`;

export default function TicketCard({ ticker, capital = 100 }: { ticker: string; capital?: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [cap, setCap] = useState(capital);

  const load = useCallback(async (c: number) => {
    if (!ticker) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ticket?ticker=${encodeURIComponent(ticker)}&capital=${c}`).then((x) => x.json());
      setData(r);
    } catch {
      setData({ error: "No se pudo cargar el ticket." });
    }
    setLoading(false);
  }, [ticker]);

  useEffect(() => { load(cap); }, [load, cap]);

  // Recuerda el capital entre visitas.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("nagimi.capitalDia"));
      if (saved > 0) setCap(saved);
    } catch { /* sin localStorage */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("nagimi.capitalDia", String(cap)); } catch { /* no-op */ }
  }, [cap]);

  const t = data?.ticket;
  const setup = data?.setup;
  const ready = data?.verdict?.status === "ready";
  const color = !setup ? "#7a8699" : ready ? (setup.direction === "long" ? "#12b76a" : "#f04438") : "#e0a800";

  return (
    <section className="card" style={{ gap: 12, border: `1px solid ${color}55`, background: `${color}0d` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>🎟️ Ticket del día · {ticker}</div>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          Mi cuenta $
          <input type="number" min={20} step={10} value={cap}
            onChange={(e) => setCap(Math.max(20, Number(e.target.value) || 20))}
            style={{ width: 78, padding: "4px 7px", borderRadius: 7, border: "1px solid var(--border)",
              background: "var(--panel)", color: "var(--text)", fontSize: 12.5 }} />
        </label>
      </div>

      {loading && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Buscando el mejor contrato…</div>}
      {data?.error && <div style={{ fontSize: 12.5, color: "#f04438" }}>⚠️ {data.error}</div>}

      {data?.simulated && (
        <div style={{ fontSize: 11.5, color: "#e0a800", background: "#e0a80015", border: "1px solid #e0a80055",
          borderRadius: 8, padding: "6px 10px" }}>
          🧪 Escenario simulado — no es la situación real del mercado ahora mismo.
        </div>
      )}

      {/* No hay setup: se explica por qué, en vez de callar. */}
      {!loading && data && !setup && !data.error && (
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>
          <b>Hoy no hay entrada.</b> {data.noSetup}
        </div>
      )}

      {/* Hay tesis */}
      {setup && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ background: color, color: "#fff", borderRadius: 999, padding: "3px 11px",
              fontSize: 12, fontWeight: 800 }}>
              {setup.direction === "long" ? "↑ AL ALZA" : "↓ A LA BAJA"}
            </span>
            <span style={{ fontSize: 12.5, color: ready ? "#12b76a" : "#e0a800", fontWeight: 700 }}>
              {ready ? "✅ Listo" : "⏳ Mejor esperar"}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>R:B {setup.rr.toFixed(1)}:1</span>
          </div>

          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{data?.verdict?.reason}</div>

          {/* Un "listo" sin haber podido mirar el flujo vale menos: se dice. */}
          {ready && data?.flujoRevisado === false && (
            <div style={{ fontSize: 11.5, color: "#e0a800", lineHeight: 1.5 }}>
              ⚠️ No se pudo revisar el flujo de hoy (falta la cookie de MarketSnack), así que este
              &quot;listo&quot; solo comprueba el riesgo/beneficio, no si el dinero va en contra.
            </div>
          )}
          {ready && data?.flujoRevisado && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              ✓ Flujo del día revisado{data.flujoPremium ? ` (${(data.flujoPremium / 1e6).toFixed(1)}M en prima)` : ""}: no corre en contra de la idea.
              {data.flujoVelocidad != null && (
                <> · Cinta a <b>{data.flujoVelocidad.toFixed(1)}×</b> su ritmo normal
                  {data.flujoVelocidad >= 1.5 ? " (va rápida)" : data.flujoVelocidad <= 0.6 ? " (tranquila)" : ""}.</>
              )}
              {data.flujoVelocidad == null && " · Sin velocidad: el streamer de Tastytrade no está corriendo."}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 7 }}>
            {[["Ahora", setup.entry], ["Objetivo", setup.target], ["Stop", setup.stop]].map(([l, v]) => (
              <div key={String(l)} style={{ border: "1px solid var(--border-soft)", borderRadius: 8,
                padding: "6px 9px", background: "var(--panel-2)" }}>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{Number(v).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* El contrato concreto */}
      {setup && t && (
        <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 11, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            Comprar <span style={{ color }}>{t.type === "call" ? "CALL" : "PUT"} {t.strike}</span>
            {t.expiration && <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 12 }}> · vence {t.expiration}</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))", gap: 7 }}>
            {[
              { l: "Te cuesta", v: money(t.cost), s: t.costPctOfCapital != null ? `${t.costPctOfCapital.toFixed(0)}% de tu cuenta` : "", c: "var(--text)" },
              { l: "Si acierta ganas", v: money(t.gain), s: `sale a $${t.targetPx.toFixed(2)}`, c: "#12b76a" },
              { l: "Si toca el stop", v: `−${money(t.risk)}`, s: t.riskPctOfCapital != null ? `${t.riskPctOfCapital.toFixed(0)}% de tu cuenta` : "", c: "#f04438" },
              { l: "Probabilidad aprox.", v: `${t.approxPop.toFixed(0)}%`, s: `delta ${t.delta.toFixed(2)}`, c: t.approxPop >= 40 ? "#12b76a" : "#e0a800" },
            ].map((x) => (
              <div key={x.l} style={{ border: "1px solid var(--border-soft)", borderRadius: 8, padding: "7px 9px", background: "var(--panel-2)" }}>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{x.l}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: x.c }}>{x.v}</div>
                {x.s && <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{x.s}</div>}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Precio de la opción: ahora <b>${t.mid.toFixed(2)}</b> · objetivo <b>${t.targetPx.toFixed(2)}</b> ·
            stop <b>${t.stopPx.toFixed(2)}</b> — vende si llega a cualquiera de los dos.
            Horquilla {(t.spreadPct * 100).toFixed(1)}% · volumen {t.volume.toLocaleString("es")} · OI {t.oi.toLocaleString("es")}.
          </div>

          {t.warning && (
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "#e0a800", background: "#e0a80012",
              border: "1px solid #e0a80044", borderRadius: 8, padding: "8px 10px" }}>
              ⚠️ {t.warning}
            </div>
          )}
        </div>
      )}

      {setup && !t && data?.ticketReason && (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
          <b>Sin contrato que te sirva.</b> {data.ticketReason}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Nagimi propone, tú decides y ejecutas — nunca envía órdenes solo.
        {data?.chainSource && ` · cadena: ${data.chainSource}`}
        {data?.levels && ` · muros: ${data.levels.source}`}
      </div>
    </section>
  );
}
