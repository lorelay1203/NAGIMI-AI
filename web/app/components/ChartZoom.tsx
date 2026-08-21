"use client";

// Envoltorio reusable que añade a CUALQUIER gráfica un botón "⤢ Agrandar".
// Al pulsarlo, la gráfica se ve GRANDE en una ventana centrada; se cierra con la
// X, tocando fuera, o con Esc — para volver a pequeño. Las gráficas usan SVG con
// viewBox (responsivas), así que al ponerlas en un contenedor ancho crecen solas.

import { useEffect, useState } from "react";

export default function ChartZoom({ label, children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    // Evita que la página de atrás haga scroll mientras está grande.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      {/* Botón para agrandar (esquina superior derecha) */}
      <button type="button" onClick={() => setOpen(true)} title="Agrandar la gráfica"
        style={{
          position: "absolute", top: 10, right: 10, zIndex: 5,
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8,
          color: "var(--text)", padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
        }}>
        ⤢ Agrandar
      </button>

      {children}

      {/* Ventana grande */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(10px, 3vw, 32px)" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", background: "var(--bg, #0b0d13)", border: "1px solid var(--border)",
              borderRadius: 16, padding: "44px 16px 16px", width: "min(1280px, 97vw)", maxHeight: "94vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
            <button type="button" onClick={() => setOpen(false)} title="Cerrar (Esc)"
              style={{ position: "absolute", top: 10, right: 12, background: "var(--panel-2)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text)", padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ✕ Cerrar
            </button>
            {label && <div style={{ position: "absolute", top: 14, left: 16, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{label}</div>}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
