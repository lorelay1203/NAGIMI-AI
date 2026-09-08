"use client";

/**
 * ✅ Tus próximos pasos — lista corta y concreta, con casillas que se marcan.
 * Mismo espíritu que "Tus acciones" de otras apps de research: nada de jerga,
 * cada línea dice qué hacer y por qué, con los números reales del análisis.
 */
import { useEffect, useState } from "react";
import type { NextStep } from "@/lib/nextSteps";

const ICONO: Record<NextStep["tipo"], string> = {
  alerta: "🔔", meta: "🎯", riesgo: "⚠️", fecha: "📅",
};

export default function NextStepsCard({ ticker, steps }: { ticker: string; steps: NextStep[] }) {
  const key = `nagimi.pasos.${ticker}`;
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setMarcados(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setMarcados(new Set()); }
  }, [key]);

  const toggle = (id: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* sin localStorage */ }
      return next;
    });
  };

  if (steps.length === 0) return null;
  const hechos = steps.filter((s) => marcados.has(s.id)).length;

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>✅ Tus próximos pasos</div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{hechos}/{steps.length} revisados</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Lo que el análisis encontró, traducido a acciones concretas. Márcalas conforme las revises.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((s) => {
          const on = marcados.has(s.id);
          return (
            <label key={s.id} style={{
              display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
              padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border-soft)",
              background: on ? "var(--panel-2)" : "var(--panel)", opacity: on ? 0.65 : 1,
            }}>
              <input type="checkbox" checked={on} onChange={() => toggle(s.id)}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
              <div>
                <div style={{ fontSize: 13, lineHeight: 1.5, textDecoration: on ? "line-through" : "none" }}>
                  <span style={{ marginRight: 6 }}>{ICONO[s.tipo]}</span>{s.texto}
                </div>
                {s.motivo && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.motivo}</div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
        Generado con los datos del análisis de hoy — no es consejo financiero, es tu propio agente organizando lo que ya calculó.
      </div>
    </section>
  );
}
