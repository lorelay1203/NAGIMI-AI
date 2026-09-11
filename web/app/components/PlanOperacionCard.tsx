"use client";

// "Plan de operación" — la sección Niveles Clave de Aetheris, hecha para Nagimi.
// En vez de solo "sube o baja", da el plan masticado: dónde entrar, dónde salir
// si va mal, y cuánto ganas por cada 1 que arriesgas. Todo con datos que la
// predicción ya trae (precio, escenarios, muros de gamma). Si no hay lectura
// con lado claro, buildPlan devuelve null y esta tarjeta no se pinta.

import type { ProPrediction } from "@/lib/prediction";
import { buildPlan } from "@/lib/planOperacion";
import { px } from "../format";

const money = (n: number) => `$${px.format(n)}`;

export default function PlanOperacionCard({ prediction }: { prediction: ProPrediction | null }) {
  if (!prediction) return null;
  const plan = buildPlan(prediction);
  if (!plan) return null;

  const alcista = plan.lado === "alcista";
  const ratioBueno = plan.ratio >= 1.5;
  const ratioMalo = plan.ratio < 1;

  return (
    <section className="plan">
      <div className="plan-head">
        <div className="plan-title">Plan de operación</div>
        <div className="plan-sub">
          Si operas {alcista ? "a que sube" : "a que baja"}, así se vería — con los niveles de hoy
        </div>
      </div>

      {/* Chips: los tres números que importan */}
      <div className="plan-chips">
        <div className="plan-chip">
          <div className="plan-chip-label">Entra entre</div>
          <div className="plan-chip-val">{money(plan.entradaBaja)}–{money(plan.entradaAlta)}</div>
        </div>
        <div className="plan-chip plan-chip-stop">
          <div className="plan-chip-label">Sal si {alcista ? "baja de" : "sube de"}</div>
          <div className="plan-chip-val">{money(plan.stop)}</div>
          <div className="plan-chip-note">−{plan.riesgoPct.toFixed(1)}% · lo que arriesgas</div>
        </div>
        <div className="plan-chip plan-chip-goal">
          <div className="plan-chip-label">Objetivo</div>
          <div className="plan-chip-val">{money(plan.objetivo)}</div>
          <div className="plan-chip-note">+{plan.gananciaPct.toFixed(1)}% · lo que puedes ganar</div>
        </div>
        <div className={`plan-chip plan-chip-ratio ${ratioBueno ? "bueno" : ratioMalo ? "malo" : ""}`}>
          <div className="plan-chip-label">Riesgo / recompensa</div>
          <div className="plan-chip-val">1 : {plan.ratio.toFixed(1)}</div>
          <div className="plan-chip-note">
            {ratioMalo ? "arriesgas más de lo que ganas" : `ganas ${plan.ratio.toFixed(1)} por cada 1`}
          </div>
        </div>
      </div>

      {/* El párrafo en llano */}
      <div className="plan-narracion">{plan.narracion}</div>

      <div className="plan-pie">
        Los niveles salen de los muros de gamma y los escenarios de hoy. No es una orden — tú decides
        el tamaño para que la pérdida hasta el stop no pase tu límite.
      </div>
    </section>
  );
}
