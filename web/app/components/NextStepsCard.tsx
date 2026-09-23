"use client";

/**
 * ✅ Tus próximos pasos — lista corta y concreta, con casillas que se marcan.
 * Mismo espíritu que "Tus acciones" de otras apps de research: nada de jerga,
 * cada línea dice qué hacer y por qué, con los números reales del análisis.
 *
 * Van en DOS grupos a propósito: arriba lo que salió del análisis de hoy (que
 * caduca con el análisis) y abajo las reglas de la casa (que valen siempre).
 * Sin esa separación, un consejo de sentido común se lee como si el mercado
 * lo estuviera diciendo hoy — y no es lo mismo.
 */
import { useEffect, useState } from "react";
import { buildBuenasPracticas, type NextStep } from "@/lib/nextSteps";

const ICONO: Record<NextStep["tipo"], string> = {
  alerta: "🔔", meta: "🎯", riesgo: "⚠️", fecha: "📅",
};

const ETIQUETA_ORIGEN: Record<NextStep["origen"], string> = {
  analisis: "Análisis",
  practica: "Buena práctica",
};

/**
 * Casillas marcadas, guardadas en el navegador. Cada lista lleva su propia
 * clave: las del análisis van por ticker (cambia el ticker, cambian los pasos)
 * y las de buena práctica van en una clave fija, para que lo que ya marcó no
 * se le desmarque solo al abrir otra acción.
 */
function useMarcados(key: string): [Set<string>, (id: string) => void] {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setMarcados(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch { setMarcados(new Set()); }
  }, [key]);

  const toggle = (id: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* sin localStorage */ }
      return next;
    });
  };

  return [marcados, toggle];
}

function Fila({ paso, on, onToggle }: { paso: NextStep; on: boolean; onToggle: () => void }) {
  return (
    <label style={{
      display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
      padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border-soft)",
      background: on ? "var(--panel-2)" : "var(--panel)", opacity: on ? 0.65 : 1,
    }}>
      <input type="checkbox" checked={on} onChange={onToggle}
        style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
      <div>
        <div style={{ fontSize: 13, lineHeight: 1.5, textDecoration: on ? "line-through" : "none" }}>
          <span style={{ marginRight: 6 }}>{ICONO[paso.tipo]}</span>{paso.texto}{" "}
          <span className={`paso-origen paso-origen-${paso.origen}`}>{ETIQUETA_ORIGEN[paso.origen]}</span>
        </div>
        {paso.motivo && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{paso.motivo}</div>
        )}
      </div>
    </label>
  );
}

export default function NextStepsCard({ ticker, steps }: { ticker: string; steps: NextStep[] }) {
  const [marcados, toggle] = useMarcados(`nagimi.pasos.${ticker}`);
  const [marcadosPractica, togglePractica] = useMarcados("nagimi.pasos.buenas-practicas");

  const delAnalisis = steps.filter((s) => s.origen === "analisis");
  const practicas = buildBuenasPracticas();

  // Si el análisis no dejó ni un paso, la tarjeta entera no sale: una tarjeta
  // con solo consejos generales se leería como si el análisis hubiera dicho
  // algo, y hoy no dijo nada.
  if (delAnalisis.length === 0) return null;

  const total = delAnalisis.length + practicas.length;
  const hechos = delAnalisis.filter((s) => marcados.has(s.id)).length
    + practicas.filter((p) => marcadosPractica.has(p.id)).length;

  return (
    <section className="card" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>✅ Tus próximos pasos</div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{hechos}/{total} revisados</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Lo que el análisis encontró, traducido a acciones concretas, más las reglas
        de siempre. Márcalas conforme las revises.
      </div>

      <div className="paso-grupo">
        <div className="eyebrow">Lo que salió del análisis de hoy</div>
        {delAnalisis.map((s) => (
          <Fila key={s.id} paso={s} on={marcados.has(s.id)} onToggle={() => toggle(s.id)} />
        ))}
      </div>

      <div className="paso-grupo">
        <div className="eyebrow">Buena práctica · aplica siempre</div>
        {practicas.map((p) => (
          <Fila key={p.id} paso={p} on={marcadosPractica.has(p.id)} onToggle={() => togglePractica(p.id)} />
        ))}
      </div>

      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
        Generado con los datos del análisis de hoy — no es consejo financiero, es tu propio agente organizando lo que ya calculó.
      </div>
    </section>
  );
}
