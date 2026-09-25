"use client";

// 📖 Diccionario — todas las palabras raras de opciones en un solo sitio.
//
// Nagimi ya traduce cada palabra donde sale, pero a veces uno quiere leerlas
// todas de corrido, o buscar una que vio en el bróker. Para eso es esta página.
//
// El contenido vive en lib/glosario.ts (con pruebas). Aquí solo se pinta.

import { useMemo, useState } from "react";
import { glosario } from "@/lib/glosario";

export default function GlosarioPage() {
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return glosario();
    return glosario().filter(
      (e) =>
        e.termino.toLowerCase().includes(q) ||
        e.simple.toLowerCase().includes(q) ||
        e.explica.toLowerCase().includes(q),
    );
  }, [busca]);

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1000 }}>
      <div className="home-hero" style={{ marginBottom: 22 }}>
        <div className="home-kicker">Diccionario de Nagimi</div>
        <h1>Las palabras raras, <em>en cristiano</em>.</h1>
        <p>
          Todo lo que el bróker te dice en difícil, dicho como se dice de verdad. No hace
          falta saber nada de esto para usar Nagimi: está aquí por si ves una palabra en
          Robinhood o Tastytrade y quieres saber qué carrizo es.
        </p>
      </div>

      <div className="home-search" style={{ margin: "0 auto 22px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Busca una palabra, por ejemplo prima…"
          aria-label="Buscar en el diccionario"
        />
      </div>

      <section className="card">
        <div className="card-title">
          {lista.length} {lista.length === 1 ? "palabra" : "palabras"}
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Arriba va como se dice normal; debajo, chiquita, la palabra que vas a ver en el bróker.
        </div>
        <div className="glos-lista">
          {lista.map((e) => (
            <div className="glos-item" key={e.termino}>
              <div className="glos-simple">{e.simple}</div>
              <div className="glos-tec">en el bróker sale como: {e.termino}</div>
              <div className="glos-explica">{e.explica}</div>
            </div>
          ))}
        </div>
        {lista.length === 0 && (
          <div className="research-muted">
            Esa palabra todavía no está en el diccionario. Pregúntasela al chat del reporte
            y si hace falta la añadimos aquí.
          </div>
        )}
      </section>
    </main>
  );
}
