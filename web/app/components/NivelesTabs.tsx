"use client";

// Los niveles clave en UNA tarjeta con pestañas.
//
// Antes eran cuatro tarjetas seguidas (Soportes y resistencias, Muros PRO, GEX
// en vivo, Perfil de gamma) que mostraban el mismo techo, piso e imán dibujados
// de cuatro formas. Ahora se escoge la vista; la última elegida se recuerda.
//
// Las pestañas que no se ven se quedan montadas (solo ocultas) para que las
// gráficas no vuelvan a pedir datos cada vez que cambias.

import { useEffect, useState, type ReactNode } from "react";

export interface NivelTab {
  id: string;
  label: string;
  /** Qué enseña esta vista, en una línea llana. */
  hint: string;
  node: ReactNode;
}

const CLAVE = "nagimi.nivelesTab";

export default function NivelesTabs({ tabs }: { tabs: NivelTab[] }) {
  const [elegida, setElegida] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE);
      if (v) setElegida(v);
    } catch { /* sin almacenamiento: se usa la primera */ }
  }, []);

  if (tabs.length === 0) {
    return (
      <section className="card">
        <div className="feed-empty">Todavía no hay niveles para este ticker.</div>
      </section>
    );
  }

  const activa = tabs.find((t) => t.id === elegida) ?? tabs[0];
  const elegir = (id: string) => {
    setElegida(id);
    try { localStorage.setItem(CLAVE, id); } catch { /* no pasa nada */ }
  };

  return (
    <div className="niv-wrap">
      <div className="niv-tabs" role="tablist" aria-label="Vista de niveles">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === activa.id}
            className={t.id === activa.id ? "on" : ""}
            onClick={() => elegir(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="niv-hint">{activa.hint}</div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== activa.id}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
