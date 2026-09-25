"use client";

// 📖 Una palabra técnica pintada de forma que se entienda.
//
// Sale el nombre en cristiano y, chiquita al lado, la palabra que usa el
// bróker — porque en Robinhood o Tastytrade sí va a ver "VWAP", y tiene que
// poder reconocerla. Al tocarla se abre la explicación de una línea.
//
// Si la palabra no está en lib/glosario.ts, se pinta tal cual y no pasa nada:
// nunca se inventa una traducción.

import { useState } from "react";
import { definir } from "@/lib/glosario";

export default function Termino({
  t,
  /** true = solo el nombre simple, sin la palabra del bróker al lado. */
  soloSimple = false,
}: {
  t: string;
  soloSimple?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const e = definir(t);

  if (!e) return <>{t}</>;

  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term"
        onClick={() => setAbierto((v) => !v)}
        title={e.explica}
        aria-expanded={abierto}
      >
        {e.simple}
        {!soloSimple && e.simple.toLowerCase() !== e.termino.toLowerCase() && (
          <span className="term-tec">{e.termino}</span>
        )}
      </button>
      {abierto && <span className="term-explica">{e.explica}</span>}
    </span>
  );
}
