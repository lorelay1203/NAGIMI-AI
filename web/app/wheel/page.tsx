"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RiskProfileCard, { DEFAULT_PROFILE, loadProfile } from "@/app/components/RiskProfileCard";
import WheelPresetCard from "@/app/components/WheelPresetCard";
import WheelTable from "@/app/components/WheelTable";
import { sortByAffordThenScore } from "@/lib/wheelAfford";
import type { PresetId, WheelCandidate } from "@/lib/wheel";
import type { RiskProfile } from "@/lib/risk";
import { migrateLegacyValue } from "@/lib/storageMigration";
import type { WheelSseEvent } from "./types";

const KEY_PRESET = "nagimi.wheel.preset";
const KEY_MODE = "nagimi.wheel.mode";
type WheelMeta = { scanned: number; failed: number; withCandidates: number; degraded: boolean };

export default function WheelPage() {
  const [profile, setProfile] = useState<RiskProfile>(DEFAULT_PROFILE);
  const [preset, setPreset] = useState<PresetId>("balanceado");
  const [mode, setMode] = useState<"csp" | "spread">("spread"); // cuenta chica → spread por defecto
  const [candidates, setCandidates] = useState<WheelCandidate[] | null>(null);
  const [meta, setMeta] = useState<WheelMeta | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    migrateLegacyValue("wheel.preset", KEY_PRESET);
    const p = window.localStorage.getItem(KEY_PRESET);
    if (p === "corto" || p === "conservador" || p === "balanceado" || p === "agresivo") setPreset(p);
    const m = window.localStorage.getItem(KEY_MODE);
    if (m === "csp" || m === "spread") setMode(m);
  }, []);

  const scan = useCallback((which: PresetId, m: "csp" | "spread") => {
    esRef.current?.close();
    setBusy(true); setError(null); setCandidates(null); setMeta(null); setProgress({ done: 0, total: 40 });
    const es = new EventSource(`/api/wheel?preset=${which}&mode=${m}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as WheelSseEvent;
      if (data.type === "progress") { setCandidates(data.candidates); setProgress({ done: data.done, total: data.total }); }
      else if (data.type === "done") { setCandidates(data.candidates); setMeta(data.meta); setBusy(false); es.close(); }
      else if (data.type === "error") { setError(data.message); setBusy(false); es.close(); }
    };
    es.onerror = () => { setError("Se cortó la conexión con el escáner."); setBusy(false); es.close(); };
  }, []);

  useEffect(() => { scan(preset, mode); return () => esRef.current?.close(); }, [scan, preset, mode]);

  const pickPreset = (p: PresetId) => { setPreset(p); window.localStorage.setItem(KEY_PRESET, p); };
  const pickMode = (m: "csp" | "spread") => { setMode(m); window.localStorage.setItem(KEY_MODE, m); };

  // Dinero real de los brokers conectados. Manda sobre el capital escrito a
  // mano en el perfil: lo que importa es lo que hay de verdad.
  const [saldoReal, setSaldoReal] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/balances").then((r) => r.json())
      .then((r: { total?: number }) => { if (r.total && r.total > 0) setSaldoReal(r.total); })
      .catch(() => { /* sin brokers: se usa el perfil */ });
  }, []);

  const capital = saldoReal ?? profile.accountSize;

  const rows = useMemo(() => {
    if (!candidates) return [];
    return sortByAffordThenScore(candidates, capital);
  }, [candidates, capital]);

  const operables = rows.filter((r) => !r.blocked && r.afford.affordable).length;
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="ideas-page">
      <div className="hb">
        <div className="hb-brand">
          <div className="hb-logo">🎡</div>
          <div className="hb-name">Wheel</div>
          <div className="hb-chip">ingresos vendiendo puts</div>
        </div>
        <a href="/" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>← Volver al inicio</a>
      </div>

      <div className="ideas-body">
        {/* Modo: spread (barato, cuenta chica) vs put suelto (Wheel clásico, mucho colateral) */}
        <div className="card" style={{ gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>¿Cómo quieres vender el put?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => pickMode("spread")}
              style={{ flex: 1, minWidth: 160, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: mode === "spread" ? "2px solid var(--accent)" : "1px solid var(--border)", background: mode === "spread" ? "rgba(74,217,145,0.10)" : "transparent", color: "var(--text)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🛡️ Spread (cuenta chica)</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Riesgo topado, necesitas cientos no miles. Recomendado para ti.</div>
            </button>
            <button type="button" onClick={() => pickMode("csp")}
              style={{ flex: 1, minWidth: 160, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: mode === "csp" ? "2px solid var(--accent)" : "1px solid var(--border)", background: mode === "csp" ? "rgba(74,217,145,0.10)" : "transparent", color: "var(--text)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🎡 Put suelto (Wheel clásico)</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Si te asignan, compras 100 acciones. Necesita miles de colateral.</div>
            </button>
          </div>
        </div>

        <WheelPresetCard preset={preset} onChange={pickPreset} />
        <RiskProfileCard profile={profile} onChange={setProfile} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="rescan" onClick={() => scan(preset, mode)} disabled={busy}>↻ Volver a escanear</button>
        </div>

        {/* Barra de progreso — para que veas que SÍ está trabajando */}
        {busy && progress && (
          <div className="card" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: "var(--muted)" }}>🔍 Escaneando el mercado…</span>
              <b style={{ color: "var(--text)" }}>{progress.done} de {progress.total} acciones</b>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width .3s" }} />
            </div>
            {operables > 0 && (
              <div style={{ fontSize: 12, color: "#4ad991", fontWeight: 600 }}>
                Ya van {operables} que caben en tu efectivo — la lista se llena en vivo 👇
              </div>
            )}
          </div>
        )}
        {error && <div className="error">⚠ {error}</div>}

        {!busy && meta && (
          <div className="wheel-status">
            Revisadas {meta.scanned} acciones · <b style={{ color: "#4ad991" }}>{operables}</b> caben en tu efectivo
            {saldoReal != null && <> (${saldoReal.toFixed(2)} reales de tus brokers)</>} · {rows.filter((r) => !r.blocked).length} candidatos
            {meta.degraded && <span className="wheel-tag warn"> · datos parciales</span>}
          </div>
        )}

        {rows.length > 0 && <WheelTable rows={rows} view="pro" />}

        {!busy && !error && rows.length === 0 && (
          <div className="card wheel-empty">Sin candidatos con este perfil. Prueba otro preset arriba.</div>
        )}

        <p style={{ fontSize: 11, color: "var(--muted)" }}>
          Precios retrasados. Son candidatos, no órdenes — confirma el precio en tu bróker antes de vender.
        </p>
      </div>
    </main>
  );
}
