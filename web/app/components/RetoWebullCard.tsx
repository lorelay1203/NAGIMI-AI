"use client";

// "Reto Webull" — el rastreador de la cuenta chica. Lee el saldo de Webull de
// /api/balances (la foto que se actualiza a mano) y muestra en qué peldaño de
// la escalera está: cuánto falta para la próxima meta y qué se desbloquea.
// Si no hay cuenta Webull todavía, no se pinta.

import { useEffect, useState } from "react";
import { estadoReto, ESCALERA, type EstadoReto } from "@/lib/retoWebull";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RetoWebullCard() {
  const [estado, setEstado] = useState<EstadoReto | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/balances")
      .then((r) => r.json())
      .then((r: { cuentas?: { broker: string; disponible: number; actualizado?: string }[] }) => {
        const wb = (r.cuentas ?? []).find((c) => c.broker === "webull");
        if (wb) {
          setEstado(estadoReto(wb.disponible));
          setActualizado(wb.actualizado ?? null);
        }
      })
      .catch(() => { /* sin Webull: no se muestra */ });
  }, []);

  if (!estado) return null;

  const fecha = actualizado
    ? new Date(actualizado).toLocaleDateString("es-PR", { day: "numeric", month: "short" })
    : null;

  return (
    <section className="reto">
      <div className="reto-head">
        <div>
          <div className="reto-title">🎯 Reto Webull</div>
          <div className="reto-sub">Subir la cuenta de a poco, con calma — sin forzar lo que no cabe</div>
        </div>
        <div className="reto-saldo">
          <div className="reto-saldo-val">{money(estado.saldo)}</div>
          {fecha && <div className="reto-saldo-fecha">foto del {fecha}</div>}
        </div>
      </div>

      {/* Barra de progreso hacia la próxima meta */}
      <div className="reto-barra-wrap">
        <div className="reto-barra">
          <div className="reto-barra-fill" style={{ width: `${estado.progresoPct}%` }} />
        </div>
        <div className="reto-barra-meta">
          {estado.proximaMeta === Infinity
            ? "Meta final $100 ✓"
            : `${estado.progresoPct}% hacia $${estado.proximaMeta}`}
        </div>
      </div>

      <div className="reto-mensaje">{estado.mensaje}</div>

      {/* La escalera completa, marcando dónde estás */}
      <div className="reto-escalera">
        {ESCALERA.map((p, i) => {
          const estadoTramo = i < estado.nivel ? "hecho" : i === estado.nivel ? "actual" : "futuro";
          const rango = p.hasta === Infinity ? "$100+" : `$${p.desde || 10}–$${p.hasta}`;
          return (
            <div key={i} className={`reto-paso reto-paso-${estadoTramo}`}>
              <div className="reto-paso-icono">{estadoTramo === "hecho" ? "✓" : estadoTramo === "actual" ? "●" : "○"}</div>
              <div>
                <div className="reto-paso-rango">{rango}</div>
                <div className="reto-paso-desc">{p.desbloquea}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="reto-pie">
        {estado.desbloqueaOpciones
          ? "Ya puedes operar opciones con riesgo topado. Nagimi te muestra lo que cabe."
          : "Con este saldo aún no caben opciones — el camino es acciones fraccionadas. Cuando me digas el saldo nuevo, actualizo la foto."}
        {" "}Material de estudio, no consejo financiero.
      </div>
    </section>
  );
}
