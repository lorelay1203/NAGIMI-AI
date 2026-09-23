"use client";

// "Cómo ha cambiado la lectura" — la evolución de la tesis de Nagimi sobre este
// ticker, con las fotos que ya guarda. Es la respuesta a "EVOLUCIÓN DE LA
// TESIS" de Aetheris, pero con dos cosas que allá no están: dice en llano si se
// puso más optimista o cauteloso, y **cada foto carga si acertó o falló** contra
// el precio real de después. Si solo hay una foto, no se muestra: no hay
// historia que contar todavía.

import { useEffect, useState } from "react";
import { buildEvolucion, type EvalPunto, type EvolucionTesis, type PuntoTesis } from "@/lib/tesisTimeline";
import type { PredictionSnapshot } from "@/lib/predictionStore";

const px = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;

const DIR: Record<PuntoTesis["direction"], { txt: string; color: string; icon: string }> = {
  up: { txt: "Alcista", color: "var(--green)", icon: "▲" },
  down: { txt: "Bajista", color: "var(--red-soft)", icon: "▼" },
  flat: { txt: "Neutral", color: "var(--muted)", icon: "–" },
};

/** Fecha corta: "10 sep". */
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${meses[Number(m[2]) - 1] ?? ""}`;
}

export default function TesisTimelineCard({ ticker }: { ticker: string }) {
  const [evo, setEvo] = useState<EvolucionTesis | null>(null);

  useEffect(() => {
    let vivo = true;
    // Dos llamadas: las FOTOS (rápido, solo JSON) y la EVALUACIÓN contra el
    // precio real (más lenta, baja barras). Si la segunda falla, la línea de
    // tiempo se pinta igual — simplemente sin el "acertó/falló".
    const fotos = fetch(`/api/prediction?ticker=${encodeURIComponent(ticker)}&raw=1`)
      .then((r) => r.json())
      .then((d: { snapshots?: PredictionSnapshot[] }) => d.snapshots ?? [])
      .catch(() => [] as PredictionSnapshot[]);

    const notas = fetch(`/api/prediction?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { evals?: EvalPunto[] }) => d.evals ?? [])
      .catch(() => [] as EvalPunto[]);

    Promise.all([fotos, notas])
      .then(([snapshots, evals]) => {
        if (vivo) setEvo(buildEvolucion(snapshots, 6, evals));
      })
      .catch(() => { if (vivo) setEvo({ puntos: [], narracion: null, marcador: null }); });
    return () => { vivo = false; };
  }, [ticker]);

  // Con una sola foto (o ninguna) no hay evolución que mostrar — no se pinta.
  if (!evo || evo.puntos.length < 2) return null;

  return (
    <section className="card tesis">
      <div className="tesis-head">
        <div className="tesis-title">Cómo ha cambiado la lectura</div>
        <div className="tesis-sub">La opinión de Nagimi sobre {ticker}, foto a foto</div>
      </div>

      {evo.narracion && <div className="tesis-narracion">{evo.narracion}</div>}

      <div className="tesis-linea">
        {evo.puntos.map((p, i) => {
          const dir = DIR[p.direction];
          const ultimo = i === evo.puntos.length - 1;
          const res = p.resultado;
          return (
            <div key={p.fecha} className={`tesis-punto${ultimo ? " tesis-punto-hoy" : ""}`}>
              <div className="tesis-fecha">{fechaCorta(p.fecha)}</div>
              <div className="tesis-dot" style={{ background: dir.color }} />
              <div className="tesis-dir" style={{ color: dir.color }}>{dir.icon} {dir.txt}</div>
              <div className="tesis-base">{px(p.base)}</div>
              {res && (
                <div className={`tesis-res tesis-res-${res.estado}`} title={res.detalle}>
                  {res.txt}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* El marcador de la ventana y el detalle de la lectura más vieja que ya
          se puede medir: es lo que convierte la línea de tiempo en algo útil. */}
      {evo.marcador && <div className="tesis-marcador">{evo.marcador}</div>}
      {(() => {
        const medible = evo.puntos.find((p) => p.resultado?.estado === "acerto" || p.resultado?.estado === "fallo");
        return medible ? (
          <div className="tesis-detalle">
            <b>{fechaCorta(medible.fecha)}:</b> {medible.resultado!.detalle}
          </div>
        ) : null;
      })()}
    </section>
  );
}
