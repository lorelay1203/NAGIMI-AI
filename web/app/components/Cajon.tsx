"use client";

// Cajón de la portada que carga su contenido SOLO cuando lo abres.
//
// Con <details> normal, lo de adentro se monta aunque esté cerrado: Paper
// Trading pedía el precio de docenas de trades viejos al abrir el panel, y
// con el límite de 6 pedidos a la vez del navegador, la tabla "Tu
// investigación" se quedaba en fila y se pasaba de su tope (22-sep, SPY y
// QQQ salían "tardó demasiado"). Una vez abierto se queda montado, para no
// volver a pedir todo cada vez que lo cierras y abres.

import { useState, type ReactNode } from "react";

export default function Cajon({
  id,
  titulo,
  sub,
  children,
}: {
  id: string;
  titulo: string;
  sub: string;
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  return (
    <details
      className="home-drawer"
      id={id}
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setMontado(true); }}
    >
      <summary>{titulo} <span>{sub}</span></summary>
      {montado && <div className="home-drawer-body">{children}</div>}
    </details>
  );
}
