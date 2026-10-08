"use client";

// 🎯 "Si el precio llega a…" — el plan para cada nivel importante.
//
// Para el techo más cercano, el suelo más cercano y (en día de rango) el rango
// entre los dos: qué hacer si el muro aguanta y qué hacer si se rompe, con la
// estrategia, las patas, la meta, la salida y qué tan confiable es hoy.
// El cálculo vive en lib/planNiveles.ts (puro, con pruebas).

import { useMemo } from "react";
import type { GexHeatmap } from "@/lib/gexHeatmap";
import { nivelesConfirmados } from "@/lib/nivelesConfirmados";
import { filasNivel, planPorNiveles, type Jugada } from "@/lib/planNiveles";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;

const CONF: Record<Jugada["confianza"], string> = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" };

function JugadaBox({ j }: { j: Jugada }) {
  return (
    <div className={`pn-jugada pn-${j.tono}`}>
      <div className="pn-si">{j.si}</div>
      <div className="pn-estrategia">{j.estrategia}</div>
      <div className="pn-patas">{j.patas}</div>
      <div className="pn-datos">
        <span><b>Meta:</b> {j.meta}</span>
        <span><b>Salida:</b> {j.salida}</span>
      </div>
      <div className="pn-pie">
        <span className={`pn-conf pn-conf-${j.confianza}`}>{CONF[j.confianza]}</span>
        <span className="pn-porque">{j.porQue}</span>
      </div>
    </div>
  );
}

export default function PlanNivelesCard({
  ticker,
  heat,
  regimen,
  callPct,
}: {
  ticker: string;
  heat: GexHeatmap | null;
  regimen: "positive" | "negative" | null;
  /** % del dinero de opciones que fue a calls (0-100). */
  callPct: number | null;
}) {
  const planes = useMemo(() => {
    if (!heat || heat.cells.length === 0 || !(heat.spot > 0)) return null;
    const datos = nivelesConfirmados({
      celdas: heat.cells.map((c) => ({ strike: c.strike, expiration: c.expiration, callGex: c.callGex, putGex: c.putGex })),
      vencimientos: heat.expirations.map((e) => ({ expiration: e.expiration, dte: e.dte })),
      spot: heat.spot,
      iv: heat.iv,
    });
    const strikes = [...new Set(heat.cells.map((c) => c.strike))].sort((a, b) => a - b);
    let paso = Infinity;
    for (let k = 1; k < strikes.length; k++) paso = Math.min(paso, strikes[k] - strikes[k - 1]);
    return planPorNiveles({
      ticker, spot: heat.spot, regimen,
      flujoAlcista: callPct == null ? null : callPct / 100,
      filas: filasNivel([...datos.techos, ...datos.suelos]),
      paso: Number.isFinite(paso) && paso > 0 ? paso : 1,
    });
  }, [heat, regimen, callPct, ticker]);

  if (!planes || planes.length === 0) return null;

  return (
    <section className="card pn">
      <div className="pn-head">
        <div>
          <div className="pn-kicker">Plan por niveles</div>
          <div className="pn-titulo">Si el precio llega a…</div>
          <div className="card-sub">
            Qué hacer en cada muro de {ticker}: si aguanta y si se rompe.{" "}
            {regimen === "positive" ? "Hoy es día de rango: los muros tienden a aguantar."
              : regimen === "negative" ? "Hoy es día de empujón: los muros aguantan menos y las rupturas se estiran."
                : ""}
            {callPct != null && ` El ${callPct}% del dinero de opciones fue a calls.`}
          </div>
        </div>
      </div>

      {planes.map((p) => (
        <div key={`${p.tipo}-${p.precio}`} className="pn-nivel">
          <div className="pn-nivel-head">
            <span className={`pn-precio pn-precio-${p.tipo}`}>{p.distanciaPct === 0 && p.veces === 0 ? "Rango" : usd(p.precio)}</span>
            <span className="pn-nivel-txt">
              {p.distanciaPct === 0 && p.veces === 0
                ? "Si no rompe ni para arriba ni para abajo"
                : `${p.tipo === "techo" ? "Techo" : p.tipo === "suelo" ? "Suelo" : "Zona de pelea"} · ${p.distanciaPct >= 0 ? "+" : ""}${p.distanciaPct.toFixed(1)}% del precio`
                  + (p.veces > 1 ? ` · se repite en ${p.veces} vencimientos` : "")}
            </span>
          </div>
          <div className="pn-jugadas">
            {p.jugadas.map((j, k) => <JugadaBox key={k} j={j} />)}
          </div>
        </div>
      ))}

      <div className="pn-nota">
        Es un plan, no una orden: los precios de cada contrato los ves en <a href="/daytrades">Ticket del día</a> o{" "}
        <a href="/prima">Venta de prima</a>. Espera la confirmación (las dos velas) antes de entrar.
      </div>
    </section>
  );
}
