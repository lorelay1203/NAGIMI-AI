"use client";

/**
 * ✅ Reglas de oro: el chequeo (lib/reglasOro.ts) en una caja plegable con
 * semáforo. Lo usan el Ticket del día y la Venta de prima.
 */
import { useState } from "react";
import type { ResultadoReglas } from "@/lib/reglasOro";

const ICONO = { ok: "✅", ojo: "⚠️", no: "⛔", sin_dato: "▫️" } as const;

/** Chequeo con las reglas de oro: una línea por regla. */
export default function ReglasOroBox({ r }: { r: ResultadoReglas }) {
  const [abierto, setAbierto] = useState(r.veredicto !== "verde");
  return (
    <div className={`tk-reglas tk-reglas-${r.veredicto}`}>
      <button type="button" className="tk-reglas-head" onClick={() => setAbierto((x) => !x)}>
        <span className="tk-reglas-sem">{r.veredicto === "verde" ? "🟢" : r.veredicto === "amarillo" ? "🟡" : "🔴"}</span>
        <span><b>Reglas de oro</b> — {r.resumen}</span>
        <span className="tk-reglas-flecha">{abierto ? "▲" : "▼"}</span>
      </button>
      {abierto && (
        <ul className="tk-reglas-lista">
          {r.reglas.map((x) => (
            <li key={x.id} className={`tk-reglas-${x.estado}`}>
              <span className="tk-reglas-ico">{ICONO[x.estado]}</span>
              <span><b>{x.nombre}:</b> {x.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
