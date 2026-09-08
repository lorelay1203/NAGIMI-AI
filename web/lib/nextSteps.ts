// ============================================================================
// "Tus próximos pasos" — la lectura técnica del análisis, traducida a una
// lista corta de acciones concretas, en el mismo lenguaje llano que usa
// Aetheris/FinAnalista ("pon una alerta en $X, si llega ahí podría ser buen
// momento para...") pero con los números REALES que Nagimi ya calculó — nunca
// genéricos, nunca inventados. Si un dato no está, ese paso simplemente no sale.
// ============================================================================

import type { ProPrediction } from "./prediction";
import type { LevelsReport } from "./levels";
import type { GexAnalysis } from "./gex";

export interface NextStep {
  id: string;
  /** La acción en una frase, lista para leer — sin tecnicismos. */
  texto: string;
  /** Por qué, en un fragmento corto (opcional, se ve en gris debajo). */
  motivo?: string;
  tipo: "alerta" | "meta" | "riesgo" | "fecha";
}

const money = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

/**
 * Arma la lista de pasos a partir de lo que YA calculó el resto de Nagimi
 * (predicción, soportes/resistencias, GEX). Pura: sin red, fácil de probar.
 */
export function buildNextSteps(
  ticker: string,
  prediction: ProPrediction | null,
  levels: LevelsReport | null,
  gex: GexAnalysis | null,
): NextStep[] {
  const steps: NextStep[] = [];
  const spot = prediction?.spot ?? levels?.spot ?? gex?.spot ?? 0;
  if (!(spot > 0)) return steps;

  // 1) Alerta de precio en el soporte más fuerte — "si cae hasta aquí, mira de comprar".
  const sup = levels?.keySupport;
  if (sup && sup.price < spot) {
    const dist = Math.round(((spot - sup.price) / spot) * 100);
    steps.push({
      id: "alerta-soporte",
      tipo: "alerta",
      texto: `Pon una alerta de precio en ${money(sup.price)} (${dist}% abajo del precio actual). Si ${ticker} cae hasta ahí, podría ser un buen punto para mirar de comprar.`,
      motivo: sup.why,
    });
  }

  // 2) Meta de ganancia en la resistencia más fuerte — "si sube hasta aquí, decide si vendes".
  const res = levels?.keyResistance;
  if (res && res.price > spot) {
    const dist = Math.round(((res.price - spot) / spot) * 100);
    steps.push({
      id: "meta-resistencia",
      tipo: "meta",
      texto: `Considera una meta de ganancia en ${money(res.price)} (${dist}% arriba). Decide desde ahora si vendes parte ahí o te quedas por más.`,
      motivo: res.why,
    });
  }

  // 3) El escenario alcista de la predicción, si trae más detalle que la resistencia.
  if (prediction?.bull && Math.abs(prediction.bull.changePct) > 1) {
    steps.push({
      id: "escenario-alcista",
      tipo: "meta",
      texto: `Si ${ticker} sigue subiendo, el escenario más optimista de Nagimi apunta a ${money(prediction.bull.target)} (${pct(prediction.bull.changePct)}) en los próximos ${prediction.horizonDays} días.`,
      motivo: prediction.bull.driver,
    });
  }

  // 4) El riesgo del escenario bajista.
  if (prediction?.bear && Math.abs(prediction.bear.changePct) > 1) {
    steps.push({
      id: "escenario-bajista",
      tipo: "riesgo",
      texto: `El riesgo a vigilar: si el mercado gira, ${ticker} podría caer hasta ${money(prediction.bear.target)} (${pct(prediction.bear.changePct)}) en ${prediction.horizonDays} días.`,
      motivo: prediction.bear.driver,
    });
  }

  // 5) Régimen de gamma — qué tipo de movimiento esperar hoy.
  if (gex?.regime && gex.kingStrike != null) {
    steps.push(
      gex.regime === "positive"
        ? {
            id: "gex-regimen",
            tipo: "riesgo",
            texto: `Hoy el mercado está en gamma positiva: tiende a moverse poco y volver hacia ${money(gex.kingStrike)}. No esperes un movimiento grande de un solo golpe.`,
          }
        : {
            id: "gex-regimen",
            tipo: "riesgo",
            texto: `Hoy el mercado está en gamma negativa: los movimientos pueden acelerarse más de lo normal, en cualquier dirección. Ten el stop más ancho de lo usual.`,
          },
    );
  }

  // 6) Aviso de baja confianza — para no seguir un análisis flojo a ciegas.
  if (prediction && prediction.confidence < 40 && prediction.active > 0) {
    steps.push({
      id: "confianza-baja",
      tipo: "riesgo",
      texto: `La confianza de este análisis es baja (${prediction.confidence}/100) — hay poca información clara todavía. Trátalo como una primera mirada, no como una señal fuerte.`,
    });
  }

  return steps;
}
