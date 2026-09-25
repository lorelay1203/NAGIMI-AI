"use client";

// 👥 Panel de agentes a la derecha — se abre desde la barra de arriba.
//
// Es el "Panel de agentes" que Aetheris abre a la derecha, pero con lecturas
// de verdad en vez de "próximamente":
//   · los seis que ponen nota salen del análisis completo que ya corrió el
//     Panel (se reciben por `notas`); si no ha corrido, se dice.
//   · los cinco de contexto se leen en vivo al abrir (useLecturasAgentes).
//   · los que Nagimi todavía no tiene se listan con el porqué.
//
// Solo pide datos la primera vez que se abre para un ticker: cerrado no gasta
// conexiones (el navegador solo abre 6 a la vez por sitio).

import { useEffect, useRef } from "react";
import { CATALOGO, SIN_DATOS } from "@/lib/mesaAgentes";
import { useLecturasAgentes, type EstadoAgente } from "./useLecturasAgentes";

/** Nota 0-10 de los seis agentes que puntúan, por código. */
export type NotasAgentes = Partial<Record<"AGR" | "CNV" | "INU" | "EST" | "IV" | "PRE", number | null>>;

const QUE_PUNTUAN = new Set(["AGR", "CNV", "INU", "EST", "IV", "PRE"]);

function tonoNota(n: number): "up" | "down" | "neutral" {
  return n >= 6.5 ? "up" : n <= 3.5 ? "down" : "neutral";
}

export default function PanelAgentes({
  abierto,
  onCerrar,
  ticker,
  notas,
  analizando = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  ticker: string | null;
  notas?: NotasAgentes;
  /** true mientras el Panel está corriendo el análisis completo. */
  analizando?: boolean;
}) {
  const { ticker: leido, vivos, analizar } = useLecturasAgentes();
  const cerrarRef = useRef<HTMLButtonElement>(null);

  // Se lee al abrir, y otra vez si cambió el ticker.
  useEffect(() => {
    if (abierto && ticker && ticker !== leido) analizar(ticker);
  }, [abierto, ticker, leido, analizar]);

  // Esc cierra; el foco va al botón de cerrar al abrir.
  useEffect(() => {
    if (!abierto) return;
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const hayNotas = notas && Object.values(notas).some((n) => n != null);

  return (
    <>
      <div className="pa-fondo" onClick={onCerrar} aria-hidden="true" />
      <aside className="pa" role="dialog" aria-label="Panel de agentes">
        <div className="pa-head">
          <div>
            <div className="pa-kicker">Mesa de Nagimi</div>
            <div className="pa-titulo">Panel de agentes{ticker ? <> · <span className="pa-tk">{ticker}</span></> : null}</div>
          </div>
          <button ref={cerrarRef} type="button" className="pa-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        {!ticker && (
          <div className="pa-vacio">Busca un ticker arriba y aquí verás qué está mirando cada agente.</div>
        )}

        {ticker && (
          <div className="pa-lista">
            {CATALOGO.map((a) => {
              const puntua = QUE_PUNTUAN.has(a.codigo);
              const nota = puntua ? notas?.[a.codigo as keyof NotasAgentes] ?? null : null;
              const vivo: EstadoAgente | undefined = puntua ? undefined : vivos[a.codigo];
              const dato = typeof vivo === "object" ? vivo : null;

              const tono = nota != null ? tonoNota(nota) : dato?.tono ?? "none";
              const estado = puntua
                ? (nota != null ? "EN VIVO" : analizando ? "LEYENDO" : "FALTA ANÁLISIS")
                : vivo === "cargando" ? "LEYENDO" : dato ? "EN VIVO" : "SIN DATO";

              return (
                <div key={a.codigo} className={`pa-card pa-${tono}`}>
                  <div className="pa-card-top">
                    <span className={`pa-dot pa-dot-${tono}`} aria-hidden="true" />
                    <span className="pa-nombre">{a.nombre}</span>
                    <span className={`pa-chip ${estado === "EN VIVO" ? "vivo" : ""}`}>{estado}</span>
                    {nota != null && <span className="pa-nota">{nota.toFixed(1)}<small>/10</small></span>}
                  </div>
                  <div className="pa-quehace">{a.queHace}</div>

                  {dato && (
                    <div className="pa-lectura">
                      <b>{dato.senal}:</b> {dato.viendo}
                      {dato.empuje && <div className="pa-empuje">› {dato.empuje}</div>}
                    </div>
                  )}
                  {puntua && nota != null && (
                    <div className="pa-lectura">
                      <b>{nota >= 6.5 ? "A favor" : nota <= 3.5 ? "En contra" : "Neutral"}</b> · pesa {a.weight}% del puntaje de Nagimi.
                    </div>
                  )}
                  {puntua && nota == null && (
                    <div className="pa-pendiente">
                      › {analizando
                        ? "esperando el análisis completo…"
                        : hayNotas
                          ? "Este agente no tuvo datos en el análisis de hoy."
                          : "Se llena cuando corres el análisis completo del ticker."}
                    </div>
                  )}
                  {!puntua && vivo === "sin dato" && (
                    <div className="pa-pendiente">› No hubo datos para {ticker} ahora mismo.</div>
                  )}
                  {!puntua && vivo === "cargando" && <div className="pa-pendiente">› leyendo el mercado…</div>}
                </div>
              );
            })}

            <div className="pa-sep">Todavía no armados</div>
            {SIN_DATOS.map((a) => (
              <div key={a.codigo} className="pa-card pa-off">
                <div className="pa-card-top">
                  <span className="pa-dot" aria-hidden="true" />
                  <span className="pa-nombre">{a.nombre}</span>
                  <span className="pa-chip">POR ARMAR</span>
                </div>
                <div className="pa-quehace">{a.queHace}</div>
                <div className="pa-pendiente">› {a.porQueNo}</div>
              </div>
            ))}

            <a className="pa-mas" href={`/agentes?ticker=${encodeURIComponent(ticker)}`}>Ver la mesa completa →</a>
          </div>
        )}
      </aside>
    </>
  );
}
