"use client";

/**
 * Pantalla de carga del análisis.
 *
 * El backend emite ~40-100 pasos técnicos de DOS streams en paralelo que
 * cambian a toda velocidad. Para el usuario se colapsan en 4 fases claras y una
 * barra que solo sube (no se lee el texto de cada paso, solo cuántos llegaron).
 *
 * Dos formas:
 *   · completa  → mientras todavía no hay nada que mostrar: el ticker en grande,
 *                 un anillo de progreso y las 4 fases como chips.
 *   · compacta  → en cuanto llegan los primeros resultados, se encoge a una
 *                 barrita de una línea para no tapar el análisis mientras
 *                 termina de leer lo que falta.
 */

const PHASES = [
  "Conectando con el mercado",
  "Leyendo el flujo de opciones",
  "Descargando la cadena de opciones",
  "Calculando escenarios y niveles",
];

const CORTO = ["Conectando", "Flujo", "Cadena", "Escenarios"];

export default function AnalysisLoader({
  ticker,
  steps,
  compacto = false,
}: {
  ticker: string | null;
  steps: string[];
  /** true cuando ya hay resultados en pantalla: solo una barrita arriba. */
  compacto?: boolean;
}) {
  // Progreso suave y siempre creciente sobre el nº de pasos recibidos. Se topa
  // en 97% hasta que el análisis termina y el loader se quita.
  const progress = Math.min(0.97, 1 - Math.exp(-steps.length / 16));
  const phase = progress < 0.30 ? 0 : progress < 0.60 ? 1 : progress < 0.85 ? 2 : 3;
  const pct = Math.round(progress * 100);

  if (compacto) {
    return (
      <div className="ld-mini" role="status" aria-live="polite">
        <span className="ld-mini-spin" aria-hidden="true" />
        <span className="ld-mini-text">Terminando de leer: <b>{PHASES[phase].toLowerCase()}</b></span>
        <span className="ld-mini-bar"><span style={{ width: `${pct}%` }} /></span>
        <span className="ld-mini-pct">{pct}%</span>
      </div>
    );
  }

  // Anillo: circunferencia de un círculo de radio 42.
  const C = 2 * Math.PI * 42;

  return (
    <section className="ld" role="status" aria-live="polite">
      <div className="ld-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="ldGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent-2)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="42" className="ld-ring-track" />
          <circle cx="50" cy="50" r="42" className="ld-ring-fill"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <div className="ld-ring-center">
          <div className="ld-ticker">{ticker ?? "—"}</div>
          <div className="ld-pct">{pct}%</div>
        </div>
      </div>

      <div className="ld-body">
        <div className="ld-kicker">Analizando</div>
        <div className="ld-title" key={phase}>{PHASES[phase]}…</div>
        <div className="ld-chips">
          {CORTO.map((label, i) => (
            <span key={label} className={`ld-chip ${i < phase ? "done" : i === phase ? "active" : ""}`}>
              {i < phase ? "✓" : i === phase ? <span className="ld-dot" aria-hidden="true" /> : null}
              {label}
            </span>
          ))}
        </div>
        <div className="ld-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="ld-nota">Leemos el flujo de opciones, los muros de dinero y los 14 agentes. Tarda unos 30–40 segundos.</div>
      </div>
    </section>
  );
}
