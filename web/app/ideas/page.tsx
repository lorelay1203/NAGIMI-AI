"use client";

// Screener de ideas del mercado — enfocado en CUENTA CHICA. Escanea el flujo de
// todo el mercado (SSE /api/ideas), filtra lo operable (theta sano, no vencido,
// inusual, strike cercano) y dimensiona cada idea a TU cuenta con sizeFlow.
// El saldo vive solo en localStorage — nunca llega al servidor.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Idea, IdeasMeta, IdeasEvent } from "./types";
import { sizeFlow, type RiskProfile } from "@/lib/risk";
import IdeasTable, { type SizedIdea } from "@/app/components/IdeasTable";

const KEY_PROFILE = "nagimi.ideas.profile";
// tolerancePct 100 = las recomendaciones se basan en TODO tu capital disponible
// (no en un % por trade). La usuaria pidió recomendaciones según el capital, sin knobs.
const DEFAULT_PROFILE: RiskProfile = { accountSize: 100, tolerancePct: 100 };

export default function IdeasPage() {
  const [profile, setProfile] = useState<RiskProfile>(DEFAULT_PROFILE);
  const [view, setView] = useState<"estudiante" | "pro">("estudiante");
  const [horizonDays, setHorizonDays] = useState(20);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [meta, setMeta] = useState<IdeasMeta | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const [tickerInput, setTickerInput] = useState("");      // lo que escribe en la caja
  const [scannedTicker, setScannedTicker] = useState<string | null>(null); // qué se escaneó
  const [filterTicker, setFilterTicker] = useState<string | null>(null);   // filtro de resultados

  // Perfil desde localStorage tras montar (el saldo nunca sale del navegador).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY_PROFILE);
      if (raw) { const p = JSON.parse(raw); if (p && typeof p.accountSize === "number") setProfile({ accountSize: p.accountSize, tolerancePct: 100 }); }
    } catch { /* sin localStorage */ }
  }, []);
  const saveProfile = (p: RiskProfile) => {
    setProfile(p);
    try { localStorage.setItem(KEY_PROFILE, JSON.stringify(p)); } catch { /* noop */ }
  };

  const scan = useCallback((ticker?: string) => {
    esRef.current?.close();
    const t = (ticker ?? "").trim().toUpperCase();
    setBusy(true); setError(null); setSteps([]); setIdeas(null); setMeta(null); setFilterTicker(null);
    setScannedTicker(t || null);
    const es = new EventSource(t ? `/api/ideas?ticker=${encodeURIComponent(t)}` : "/api/ideas");
    esRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as IdeasEvent;
      if (data.type === "step") setSteps((s) => [...s, data.label]);
      else if (data.type === "done") { setIdeas(data.ideas); setMeta(data.meta); setBusy(false); es.close(); }
      else if (data.type === "error") { setError(data.message); setBusy(false); es.close(); }
    };
    es.onerror = () => { setError("Se cortó la conexión con el escáner (¿cookie de MarketSnack?)."); setBusy(false); es.close(); };
  }, []);

  useEffect(() => { scan(); return () => esRef.current?.close(); }, [scan]);

  // Sizing en el cliente: cuántos contratos caben en TU cuenta sin volarla.
  const rows: SizedIdea[] = useMemo(() => {
    if (!ideas) return [];
    return ideas
      .map((idea) => ({
        idea,
        sizing: sizeFlow(
          { price: idea.price, theta: idea.theta, thetaPctDaily: idea.thetaPctDaily, dte: idea.dte, expiryStatus: "vigente" } as Parameters<typeof sizeFlow>[0],
          profile,
          horizonDays,
        ),
      }))
      .sort((a, b) => {
        const ok = (s: SizedIdea) => (s.sizing.blocked || s.sizing.maxContracts === 0 ? 1 : 0);
        return ok(a) - ok(b) || b.idea.premium - a.idea.premium;
      });
  }, [ideas, profile, horizonDays]);

  // Tickers presentes en el resultado (para los chips de filtro) y filas a mostrar.
  const tickersInResults = useMemo(() => [...new Set(rows.map((r) => r.idea.ticker))].sort(), [rows]);
  const shownRows = filterTicker ? rows.filter((r) => r.idea.ticker === filterTicker) : rows;
  const operables = shownRows.filter((r) => !r.sizing.blocked && r.sizing.maxContracts > 0).length;
  const field: React.CSSProperties = { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontSize: 13.5 };
  const chip = (active: boolean): React.CSSProperties => ({ padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, border: active ? "1px solid var(--accent)" : "1px solid var(--border)", background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--text)" });

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1100 }}>
      <div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
        <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>💡 Ideas del mercado · cuenta chica</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Escanea el flujo de TODO el mercado y te muestra qué <b>cabe en tu cuenta</b> — con techo de contratos
          según tu tolerancia. Material de estudio, no ejecuta.
        </p>
      </div>

      {/* Elegir qué escanear: un ticker concreto o todo el mercado */}
      <section className="card" style={{ gap: 10 }}>
        <div style={{ fontWeight: 700 }}>🔍 Qué escanear</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && tickerInput.trim()) scan(tickerInput); }}
            placeholder="Escribe un ticker (SPY, AAPL, NVDA…)" spellCheck={false}
            style={{ ...field, width: 240, textTransform: "uppercase" }} />
          <button type="button" onClick={() => tickerInput.trim() && scan(tickerInput)} disabled={busy || !tickerInput.trim()}
            style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
            Escanear ticker
          </button>
          <button type="button" onClick={() => { setTickerInput(""); scan(); }} disabled={busy}
            style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>
            🌐 Todo el mercado
          </button>
          {scannedTicker && <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>Mostrando solo {scannedTicker}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
          Sin ticker escanea TODO el mercado (ahí domina SPX/SPY por su tamaño). Con un ticker, ves solo ese —
          y baja el piso de premium para que aparezcan más ideas suyas.
        </div>
      </section>

      {/* Perfil de riesgo (cuenta chica) */}
      <section className="card" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>💼 Tu cuenta</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Capital disponible ($)</label>
            <input type="number" style={{ ...field, marginTop: 4, width: 140 }} value={profile.accountSize || ""}
              onChange={(e) => saveProfile({ ...profile, accountSize: Number(e.target.value) })} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", maxWidth: 240 }}>
            Las recomendaciones se ajustan a <b style={{ color: "var(--text)" }}>tu capital disponible</b>.
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["estudiante", "pro"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  style={{ padding: "7px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: view === v ? "1px solid var(--accent)" : "1px solid var(--border)", background: view === v ? "var(--accent)" : "transparent", color: view === v ? "#fff" : "var(--text)" }}>
                  {v === "estudiante" ? "👤 Simple" : "⚡ Pro"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => scan(scannedTicker ?? undefined)} disabled={busy}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
              {busy ? "Escaneando…" : "↻ Re-escanear"}
            </button>
          </div>
        </div>
      </section>

      {busy && steps.length > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{steps[steps.length - 1]}</div>
      )}
      {error && <div className="error">⚠ {error}</div>}

      {ideas && (
        <>
          {/* Filtrar los resultados por ticker (de los que salieron) */}
          {tickersInResults.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, marginRight: 2 }}>Filtrar:</span>
              <button type="button" onClick={() => setFilterTicker(null)} style={chip(filterTicker === null)}>Todos ({rows.length})</button>
              {tickersInResults.map((t) => (
                <button key={t} type="button" onClick={() => setFilterTicker(t)} style={chip(filterTicker === t)}>{t}</button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            <b style={{ color: "var(--text)" }}>{operables}</b> caben en tu cuenta de {shownRows.length} operables
            {filterTicker && <> en {filterTicker}</>}
            {meta && <> · escaneó {meta.scanned} operaciones en {meta.tickers} tickers</>}
          </div>
          <IdeasTable rows={shownRows} profile={profile} view={view} horizonDays={horizonDays} onStar={() => {}} />
        </>
      )}

      <div className="disclaimer">
        El screener devuelve un <b>techo</b> ("tu límite es N contratos"), no una recomendación de compra.
        Nunca dimensiona una opción ilíquida. Material de estudio, no consejo financiero.
      </div>
    </main>
  );
}
