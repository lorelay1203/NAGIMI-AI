"use client";

// Motor automático de paper. Se auto-dispara una vez al día cuando abres la app
// (busca estructuras de POP ≥ 90% en el mercado y las registra en el diario de
// paper). Botón "Buscar ahora" para forzarlo. Todo simulado, sin dinero real.

import { useCallback, useEffect, useRef, useState } from "react";

const RISK_KEY = "nagimi.paperMaxRisk";
const POP_KEY = "nagimi.paperMinPop";
const RET_KEY = "nagimi.paperMinReturn";
const TERM_KEY = "nagimi.paperTerm";

interface CandLeg { type: "call" | "put"; side: "buy" | "sell"; strike: number; }
interface Candidate {
  ticker: string;
  kind?: "iron_condor" | "put_credit" | "call_credit";
  label: string;
  pop: number;
  maxLoss: number;
  maxGain: number;
  dte: number;
  note: string;
  rationale?: string;
  legs?: { optionType: "call" | "put"; side: "buy" | "sell"; strike: number }[];
}

interface ScanState {
  ranToday: boolean;
  today: string;
  lastRunDate: string | null;
  justRan?: boolean;
  lastResult: {
    ranAt: string;
    scanned: number;
    registered: number;
    popTarget: number;
    candidates: Candidate[];
    skipped: { ticker: string; reason: string }[];
  } | null;
}

const money = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

export default function AutoScanCard({ onRegistered }: { onRegistered?: () => void }) {
  const [state, setState] = useState<ScanState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [maxRisk, setMaxRisk] = useState(100); // límite de pérdida por trade ($)
  const [minPop, setMinPop] = useState(60);    // POP mínimo aceptado (%)
  const [minRet, setMinRet] = useState(25);    // ganancia mínima como % del riesgo
  const [term, setTerm] = useState<"0dte" | "corto" | "normal">("normal"); // plazo de los trades
  const [strategies, setStrategies] = useState<Set<string>>(new Set(["iron_condor", "put_credit", "call_credit"]));
  const [openCand, setOpenCand] = useState<number | null>(null); // candidato expandido en detalle
  const [trendGate, setTrendGate] = useState(true); // solo a favor de la tendencia
  const riskRef = useRef(100);
  const popRef = useRef(60);
  const retRef = useRef(25);
  const termRef = useRef<"0dte" | "corto" | "normal">("normal");
  const stratRef = useRef<string[]>(["iron_condor", "put_credit", "call_credit"]);
  const trendRef = useRef(true);

  // Capital, POP mínimo y ganancia mínima (guardados entre sesiones).
  useEffect(() => {
    const savedRisk = Number(localStorage.getItem(RISK_KEY));
    if (savedRisk > 0) { setMaxRisk(savedRisk); riskRef.current = savedRisk; }
    const savedPop = Number(localStorage.getItem(POP_KEY));
    if (savedPop > 0) { setMinPop(savedPop); popRef.current = savedPop; }
    const savedRet = Number(localStorage.getItem(RET_KEY));
    if (savedRet > 0) { setMinRet(savedRet); retRef.current = savedRet; }
    const savedTerm = localStorage.getItem(TERM_KEY);
    if (savedTerm === "0dte" || savedTerm === "corto" || savedTerm === "normal") { setTerm(savedTerm); termRef.current = savedTerm; }
  }, []);
  useEffect(() => { riskRef.current = maxRisk; if (maxRisk > 0) localStorage.setItem(RISK_KEY, String(maxRisk)); }, [maxRisk]);
  useEffect(() => { popRef.current = minPop; if (minPop > 0) localStorage.setItem(POP_KEY, String(minPop)); }, [minPop]);
  useEffect(() => { retRef.current = minRet; if (minRet > 0) localStorage.setItem(RET_KEY, String(minRet)); }, [minRet]);
  useEffect(() => { termRef.current = term; localStorage.setItem(TERM_KEY, term); }, [term]);
  useEffect(() => { stratRef.current = [...strategies]; }, [strategies]);
  useEffect(() => { trendRef.current = trendGate; }, [trendGate]);

  const toggleStrat = (k: string) => setStrategies((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    if (next.size === 0) return prev; // al menos una
    return next;
  });

  const run = useCallback(async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/paper-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, maxRisk: riskRef.current, minPop: popRef.current / 100, minReturn: retRef.current / 100, term: termRef.current, strategies: stratRef.current, trendGate: trendRef.current }),
      }).then((x) => x.json());
      setState(r);
      if (r.justRan && r.lastResult?.registered > 0) onRegistered?.();
    } catch {
      setErr("No se pudo correr el escaneo.");
    } finally {
      setBusy(false);
    }
  }, [onRegistered]);

  // Al montar: mira el estado y, si no ha corrido hoy, lo dispara solo (1×/día).
  useEffect(() => {
    let cancel = false;
    fetch("/api/paper-scan")
      .then((x) => x.json())
      .then((s: ScanState) => {
        if (cancel) return;
        setState(s);
        if (!s.ranToday) run(false);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [run]);

  const res = state?.lastResult;

  return (
    <section className="card" style={{ gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🤖 Motor automático · Paper</div>
        <div className="card-sub">
          Busca solo, una vez al día, trades en 3 formatos (Credit Put Spread, Credit Call Spread e Iron
          Condor) que cumplan <b>3 condiciones</b>: (1) la <b>probabilidad de ganar</b> que elijas, (2) una
          <b> ganancia mínima</b> que valga la pena, y (3) que <b>el agente confirme la tendencia</b> a favor
          del trade. Los registra en tu diario de paper. Sin dinero real: aquí probamos si de verdad gana.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          💵 Tu capital disponible: $
          <input type="number" value={maxRisk || ""} onChange={(e) => setMaxRisk(Number(e.target.value))}
            title="Solo busca trades cuya pérdida máxima quepa en este capital"
            style={{ width: 80, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 13, fontWeight: 700 }} />
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          🎯 Probabilidad mínima de ganar:
          <input type="number" min={40} max={95} value={minPop || ""} onChange={(e) => setMinPop(Number(e.target.value))}
            style={{ width: 56, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 13, fontWeight: 700 }} />%
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          💰 Ganancia mínima (del riesgo):
          <input type="number" min={5} max={200} value={minRet || ""} onChange={(e) => setMinRet(Number(e.target.value))}
            style={{ width: 56, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "5px 8px", fontSize: 13, fontWeight: 700 }} />%
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>⏱️ Plazo:</span>
          {(["0dte", "corto", "normal"] as const).map((tm) => (
            <button key={tm} type="button" onClick={() => setTerm(tm)}
              style={{ padding: "6px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: term === tm ? "1px solid var(--accent)" : "1px solid var(--border)", background: term === tm ? "var(--accent)" : "transparent", color: term === tm ? "#fff" : "var(--text)" }}>
              {tm === "0dte" ? "0DTE → 1DTE (mañana)" : tm === "corto" ? "Corto (3-14d)" : "~1 mes (14-45d)"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => run(true)} disabled={busy}
          style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {busy ? "Escaneando el mercado…" : "🔍 Buscar ahora"}
        </button>
      </div>

      {/* Selector de estrategias a analizar */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>📐 Estrategias:</span>
        {([
          ["put_credit", "Credit Put Spread"],
          ["call_credit", "Credit Call Spread"],
          ["iron_condor", "Iron Condor"],
        ] as const).map(([k, lbl]) => {
          const on = strategies.has(k);
          return (
            <button key={k} type="button" onClick={() => toggleStrat(k)}
              style={{ padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: on ? "1px solid var(--accent)" : "1px solid var(--border)", background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)" }}>
              {lbl}
            </button>
          );
        })}
        <button type="button" onClick={() => setTrendGate((v) => !v)}
          title="Activo: solo trades a favor de la tendencia. Apágalo para ver TODAS las estrategias (más variedad)."
          style={{ marginLeft: 6, padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: trendGate ? "1px solid #4ad991" : "1px solid var(--border)", background: trendGate ? "rgba(74,217,145,0.15)" : "transparent", color: trendGate ? "#4ad991" : "var(--muted)" }}>
          {trendGate ? "✅ Solo a favor de tendencia" : "🔓 Ver todas"}
        </button>
        {state && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {state.lastRunDate
              ? <>Última corrida: <b style={{ color: "var(--text)" }}>{state.lastRunDate}</b>{state.ranToday ? " (hoy ✓)" : ""}</>
              : "Aún no ha corrido."}
          </span>
        )}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "#ff9b94" }}>⚠️ {err}</div>}

      {res && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Revisó <b style={{ color: "var(--text)" }}>{res.scanned}</b> tickers ·
            encontró <b style={{ color: "var(--text)" }}>{res.candidates.length}</b> con POP ≥ {Math.round(res.popTarget * 100)}% ·
            registró <b style={{ color: "#4ad991" }}>{res.registered}</b> nuevos en paper.
          </div>

          {res.candidates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {res.candidates.map((c, i) => {
                const isOpen = openCand === i;
                return (
                  <div key={i} style={{ background: "var(--panel-2)", border: `1px solid ${isOpen ? "var(--accent)" : "var(--border-soft)"}`, borderRadius: 10, padding: "8px 12px" }}>
                    <div onClick={() => setOpenCand(isOpen ? null : i)} style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
                      title="Toca para ver el detalle de este trade">
                      <span style={{ color: "var(--accent)" }}>{isOpen ? "▾" : "▸"}</span>
                      <span style={{ fontWeight: 700, minWidth: 42 }}>{c.ticker}</span>
                      <span style={{ fontSize: 12.5, color: "#4ad991", fontWeight: 700 }}>{Math.round(c.pop * 100)}% POP</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.label.split(" · ")[0]}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12 }}>
                        gana <b style={{ color: "#4ad991" }}>{money(c.maxGain)}</b> · pierde <b style={{ color: "#ff8a82" }}>{money(c.maxLoss)}</b>
                      </span>
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                        {c.legs && c.legs.length > 0 && (
                          <div style={{ fontSize: 12, marginBottom: 6 }}>
                            {c.legs.map((l, j) => (
                              <div key={j} style={{ color: l.side === "buy" ? "#4ad991" : "#ff8a82" }}>
                                • {l.side === "buy" ? "Compra" : "Vende"} {l.optionType.toUpperCase()} ${l.strike}
                              </div>
                            ))}
                            <div style={{ color: "var(--muted)", marginTop: 2 }}>Vence {c.label.split(" · ").pop()}</div>
                          </div>
                        )}
                        <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "var(--text)" }}>{c.rationale ?? c.note}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                          💡 Este trade ya quedó en tu <b style={{ color: "var(--text)" }}>📝 Paper Trading</b> abajo — ahí puedes seguirlo y tocarlo para <b style={{ color: "var(--text)" }}>ejecutarlo</b> en real.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            El motor solo corre mientras la app está abierta (no hay servidor 24/7). Ábrela una vez
            al día y él hace el resto. Recuerda: 90% de ganar significa que el 10% restante puede
            ser una pérdida grande — por eso lo probamos en paper primero.
          </div>
        </>
      )}
    </section>
  );
}
