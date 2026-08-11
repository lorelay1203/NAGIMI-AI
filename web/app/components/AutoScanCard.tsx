"use client";

// Motor automático de paper. Se auto-dispara una vez al día cuando abres la app
// (busca estructuras de POP ≥ 90% en el mercado y las registra en el diario de
// paper). Botón "Buscar ahora" para forzarlo. Todo simulado, sin dinero real.

import { useCallback, useEffect, useRef, useState } from "react";

const RISK_KEY = "nagimi.paperMaxRisk";
const POP_KEY = "nagimi.paperMinPop";
const RET_KEY = "nagimi.paperMinReturn";

interface Candidate {
  ticker: string;
  label: string;
  pop: number;
  maxLoss: number;
  maxGain: number;
  dte: number;
  note: string;
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
  const riskRef = useRef(100);
  const popRef = useRef(60);
  const retRef = useRef(25);

  // Capital, POP mínimo y ganancia mínima (guardados entre sesiones).
  useEffect(() => {
    const savedRisk = Number(localStorage.getItem(RISK_KEY));
    if (savedRisk > 0) { setMaxRisk(savedRisk); riskRef.current = savedRisk; }
    const savedPop = Number(localStorage.getItem(POP_KEY));
    if (savedPop > 0) { setMinPop(savedPop); popRef.current = savedPop; }
    const savedRet = Number(localStorage.getItem(RET_KEY));
    if (savedRet > 0) { setMinRet(savedRet); retRef.current = savedRet; }
  }, []);
  useEffect(() => { riskRef.current = maxRisk; if (maxRisk > 0) localStorage.setItem(RISK_KEY, String(maxRisk)); }, [maxRisk]);
  useEffect(() => { popRef.current = minPop; if (minPop > 0) localStorage.setItem(POP_KEY, String(minPop)); }, [minPop]);
  useEffect(() => { retRef.current = minRet; if (minRet > 0) localStorage.setItem(RET_KEY, String(minRet)); }, [minRet]);

  const run = useCallback(async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/paper-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, maxRisk: riskRef.current, minPop: popRef.current / 100, minReturn: retRef.current / 100 }),
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
          💵 Máximo a arriesgar por trade: $
          <input type="number" value={maxRisk || ""} onChange={(e) => setMaxRisk(Number(e.target.value))}
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
        <button type="button" onClick={() => run(true)} disabled={busy}
          style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {busy ? "Escaneando el mercado…" : "🔍 Buscar ahora"}
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
              {res.candidates.map((c, i) => (
                <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "8px 12px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, minWidth: 46 }}>{c.ticker}</span>
                  <span style={{ fontSize: 12.5, color: "#4ad991", fontWeight: 700 }}>{Math.round(c.pop * 100)}% POP</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12 }}>
                    gana máx <b style={{ color: "#4ad991" }}>{money(c.maxGain)}</b> · pierde máx <b style={{ color: "#ff8a82" }}>{money(c.maxLoss)}</b>
                  </span>
                </div>
              ))}
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
