"use client";

// Tabla de recomendaciones de trade — material de ESTUDIO, no ejecuta nada.
// Toma la lectura del análisis (dirección, confianza, muros GEX, IV) + el capital
// que tú capturas por broker, y arma ideas de corto/largo plazo dimensionadas a tu cuenta.

import { useEffect, useMemo, useState } from "react";
import { buildIdeas, buildStrategyIdea, sizeReco, STRATEGY_OPTIONS, type Broker, type RecoInput, type TradeIdea } from "@/lib/recommend";
import type { Strategy } from "@/lib/orderBuilder";

const LS_KEY = "nagimi.brokers";
const money = (n: number) => "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

// Vencimientos que la usuaria puede elegir cuando escoge una estrategia concreta.
const DTE_OPTIONS: { dte: number; label: string }[] = [
  { dte: 0, label: "0DTE (hoy)" },
  { dte: 7, label: "1 semana" },
  { dte: 14, label: "2 semanas" },
  { dte: 30, label: "1 mes" },
];

const field: React.CSSProperties = {
  background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6,
  color: "var(--text)", padding: "4px 8px", fontSize: 12.5,
};
const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { fontSize: 12.5, padding: "8px", borderTop: "1px solid var(--border-soft)", verticalAlign: "top" };

const SIGNAL_STYLE: Record<string, React.CSSProperties> = {
  Entrar: { color: "#4ad991", border: "1px solid #2ec77f" },
  Esperar: { color: "#f5c451", border: "1px solid #b8922e" },
  Evitar: { color: "#ff8a82", border: "1px solid #ff5d52" },
};

export default function RecomendacionesCard({ ticker, input }: { ticker: string; input: RecoInput }) {
  const [brokers, setBrokers] = useState<Broker[]>([{ name: "Robinhood", cash: 0 }, { name: "Schwab", cash: 0 }]);
  const [loaded, setLoaded] = useState(false);
  const [now] = useState(() => new Date());
  const [strategy, setStrategy] = useState<"auto" | Strategy>("auto");
  const [dte, setDte] = useState(7);
  const [registered, setRegistered] = useState<Record<number, "loading" | "ok" | "err">>({});

  // Cargar/guardar el capital por broker (persiste entre sesiones).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) setBrokers(p); }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(LS_KEY, JSON.stringify(brokers)); } catch {} } }, [brokers, loaded]);

  // Saldo REAL de los brokers conectados (Tastytrade y Schwab/TOS). Las ideas se
  // dimensionan con el dinero que hay de verdad, no con porcentajes.
  const [avisos, setAvisos] = useState<string[]>([]);
  useEffect(() => {
    if (!loaded) return;
    fetch("/api/balances").then((x) => x.json()).then((r: {
      cuentas?: { brokerNombre: string; cuenta: string; disponible: number }[];
      problemas?: { brokerNombre: string; motivo: string }[];
    }) => {
      const reales = (r.cuentas ?? []).filter((c) => c.disponible > 0);
      if (reales.length) {
        setBrokers((prev) => {
          // Las cuentas leídas del broker mandan; se conservan las añadidas a mano.
          const auto = reales.map((c) => ({ name: `${c.brokerNombre} ${c.cuenta}`.trim(), cash: c.disponible }));
          const manuales = prev.filter((b) => b.cash > 0 && !auto.some((a) => a.name === b.name)
            && !/tastytrade|schwab/i.test(b.name));
          return [...auto, ...manuales];
        });
      }
      setAvisos((r.problemas ?? []).map((p) => `${p.brokerNombre}: ${p.motivo}`));
    }).catch(() => { /* sin conexión: se queda lo escrito a mano */ });
  }, [loaded]);

  const setBroker = (i: number, p: Partial<Broker>) => setBrokers((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...p } : b)));
  const addBroker = () => setBrokers((prev) => [...prev, { name: "", cash: 0 }]);
  const delBroker = (i: number) => setBrokers((prev) => prev.filter((_, idx) => idx !== i));
  const totalCash = brokers.reduce((s, b) => s + (b.cash > 0 ? b.cash : 0), 0);

  const recos = useMemo(() => {
    let ideas: TradeIdea[];
    if (strategy === "auto") {
      ideas = buildIdeas(input, now);
    } else {
      const opt = DTE_OPTIONS.find((o) => o.dte === dte) ?? DTE_OPTIONS[1];
      const idea = buildStrategyIdea(strategy, input, opt.label, now, opt.dte);
      ideas = idea ? [idea] : [];
    }
    return ideas.map((idea) => sizeReco(idea, brokers, input));
  }, [input, brokers, now, strategy, dte]);

  const dirLabel = input.direction === "up" ? "▲ Alcista" : input.direction === "down" ? "▼ Bajista" : "▬ Sin dirección clara";

  // Registra la idea en el diario de PAPER TRADING. Cotiza la entrada AHORA con
  // /api/quote (misma fuente que el P/L en vivo) para que sean comparables.
  async function registrarEnPapel(r: (typeof recos)[number], i: number) {
    setRegistered((m) => ({ ...m, [i]: "loading" }));
    try {
      let entryNet = 0;
      for (const l of r.legs) {
        const q = await fetch(`/api/quote?ticker=${ticker}&type=${l.type}&strike=${l.strike}&expiration=${r.expiry}`)
          .then((x) => x.json()).catch(() => null);
        const mid = q?.mid ?? q?.price;
        if (mid == null) throw new Error("sin cotización");
        entryNet += (l.side === "buy" ? 1 : -1) * mid;
      }
      const trade = {
        ticker,
        label: `${r.estrategia} · ${r.strikesLabel}`,
        legs: r.legs.map((l) => ({ type: l.type, side: l.side, strike: l.strike, expiration: r.expiry, qty: 1 })),
        entryNet: Math.round(entryNet * 100) / 100,
        qtyContracts: 1,
        entryTime: new Date().toISOString(),
        entrySpot: input.spot,
        source: "motor" as const,
      };
      const res = await fetch("/api/paper", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", trade }),
      }).then((x) => x.json());
      setRegistered((m) => ({ ...m, [i]: res.ok ? "ok" : "err" }));
    } catch {
      setRegistered((m) => ({ ...m, [i]: "err" }));
    }
  }

  return (
    <section className="card" style={{ gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🎯 Recomendaciones de trade · {ticker}</div>
        <div className="card-sub">
          Ideas de corto y largo plazo según el flujo (Time &amp; Sales) y la cadena de opciones — lectura actual: <b>{dirLabel}</b>
          {input.confidence != null && <> · confianza {Math.round(input.confidence)}%</>}. <b>Material de estudio, no ejecuta nada.</b>
        </div>
      </div>

      {/* Selector de estrategia */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>📐 Estrategia (elige y te recomiendo)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([{ id: "auto", label: "🤖 Auto (según dirección)" }, ...STRATEGY_OPTIONS] as { id: string; label: string }[]).map((s) => (
            <button key={s.id} type="button" onClick={() => setStrategy(s.id as "auto" | Strategy)}
              style={{
                padding: "6px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: strategy === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: strategy === s.id ? "var(--accent)" : "transparent",
                color: strategy === s.id ? "#fff" : "var(--text)",
              }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selector de vencimiento (solo al elegir una estrategia concreta) */}
      {strategy !== "auto" && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>📅 Vencimiento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DTE_OPTIONS.map((o) => (
              <button key={o.dte} type="button" onClick={() => setDte(o.dte)}
                style={{
                  padding: "6px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  border: dte === o.dte ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: dte === o.dte ? "var(--accent)" : "transparent",
                  color: dte === o.dte ? "#fff" : "var(--text)",
                }}>
                {o.label}
              </button>
            ))}
          </div>
          {dte === 0 && <div style={{ fontSize: 11, color: "#f5c451", marginTop: 5 }}>⚠ 0DTE vence hoy: se mueve rapidísimo. Solo estudio, riesgo alto.</div>}
        </div>
      )}

      {/* Capital por broker */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>💼 Dinero disponible</div>
        <div style={{ fontSize: 11, color: "#4ad991" }}>
          ✓ Se lee solo de tus brokers conectados. Si usas otro (Robinhood…), agrégalo a mano abajo.
        </div>
        {avisos.map((a) => (
          <div key={a} style={{ fontSize: 11, color: "#f5c451" }}>⚠️ {a}</div>
        ))}
        {brokers.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...field, width: 150 }} placeholder="Broker (ej. Robinhood)" value={b.name} onChange={(e) => setBroker(i, { name: e.target.value })} />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>$</span>
            <input type="number" style={{ ...field, width: 120 }} placeholder="monto" value={b.cash || ""} onChange={(e) => setBroker(i, { cash: Number(e.target.value) })} />
            <button type="button" onClick={() => delBroker(i)} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={addBroker} style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12.5 }}>+ Agregar broker</button>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Total: <b style={{ color: "var(--text)" }}>{money(totalCash)}</b></span>
        </div>
      </div>

      {/* Tabla de recomendaciones */}
      {input.spot > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Plazo</th>
                <th style={th}>Estrategia</th>
                <th style={th}>Strikes</th>
                <th style={th}>Vence</th>
                <th style={th}>Riesgo/contrato</th>
                <th style={th}>Cabe en</th>
                <th style={th}>Señal</th>
              </tr>
            </thead>
            <tbody>
              {recos.map((r, i) => {
                return (
                  <tr key={i}>
                    <td style={td}><span style={{ fontWeight: 700 }}>{r.plazo}</span><div style={{ fontSize: 10.5, color: "var(--muted)" }}>{r.dte}d</div></td>
                    <td style={td}><span style={{ fontWeight: 600 }}>{r.estrategia}</span><div style={{ fontSize: 11, color: "var(--muted)", maxWidth: 220 }}>{r.reason}</div></td>
                    <td style={td}>{r.strikesLabel}</td>
                    <td style={td}>{r.expiry}</td>
                    <td style={td}>
                      <span style={{ color: "#ff8a82", fontWeight: 600 }}>{money(r.riskOne)}</span>
                      {r.maxGain != null ? <div style={{ fontSize: 10.5, color: "#4ad991" }}>gana máx {money(r.maxGain)}</div> : <div style={{ fontSize: 10.5, color: "#4ad991" }}>ganancia abierta</div>}
                    </td>
                    <td style={td}>
                      {r.broker
                        ? <><b>{r.broker}</b><div style={{ fontSize: 10.5, color: "var(--muted)" }}>caben {r.contracts} contrato{r.contracts === 1 ? "" : "s"}</div></>
                        : <span style={{ color: "#e0a800", fontSize: 11.5 }}>no te alcanza</span>}
                    </td>
                    <td style={td}>
                      <span style={{ ...SIGNAL_STYLE[r.signal], padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{r.signal}</span>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", maxWidth: 220, marginTop: 3 }}>{r.note}</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, maxWidth: 240 }}>
                        {r.gates.map((g) => (
                          <span key={g.name} title={g.note} style={{ fontSize: 9.5, padding: "1px 5px", borderRadius: 999, border: `1px solid ${g.ok ? "#2ec77f" : "#b8922e"}`, color: g.ok ? "#4ad991" : "#f5c451", cursor: "help" }}>
                            {g.ok ? "✓" : "⚠"} {g.name}
                          </span>
                        ))}
                      </div>
                      <button type="button" onClick={() => registrarEnPapel(r, i)} disabled={registered[i] === "loading" || registered[i] === "ok"}
                        title="Guarda esta idea en Paper Trading y la sigue con precios reales (sin dinero real)."
                        style={{
                          marginTop: 6, fontSize: 11, fontWeight: 600, borderRadius: 7, padding: "4px 9px", cursor: registered[i] === "ok" ? "default" : "pointer",
                          border: `1px solid ${registered[i] === "ok" ? "#2ec77f" : registered[i] === "err" ? "#ff5d52" : "var(--border)"}`,
                          background: registered[i] === "ok" ? "rgba(46,199,127,0.12)" : "transparent",
                          color: registered[i] === "ok" ? "#4ad991" : registered[i] === "err" ? "#ff8a82" : "var(--text)",
                        }}>
                        {registered[i] === "ok" ? "✓ En papel" : registered[i] === "err" ? "⚠ Reintentar" : registered[i] === "loading" ? "…" : "📝 Registrar en papel"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Analiza un ticker para ver recomendaciones.</div>
      )}

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textAlign: "center" }}>
        La IA propone · las reglas (Risk Gate) controlan · TÚ apruebas. Nagimi nunca ejecuta. <span style={{ color: "var(--muted)", fontWeight: 400 }}>(Metodología Ruta 2030 · Playbook 3)</span>
      </div>
      <div className="disclaimer">
        Cada idea pasa el <b>Risk Gate</b>: Perfil · No arriesga toda la cuenta · Riesgo definido · Cabe en tu dinero · Datos fiables.
        Se dimensiona con el <b>saldo real</b> de tus brokers, en dólares. Primas estimadas (Black-Scholes); precios exactos en el Order Builder. No es consejo financiero.
      </div>
    </section>
  );
}
