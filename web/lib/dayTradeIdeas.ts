// ============================================================================
// Ideas de DAY-TRADE derivadas de los muros de gamma (GEX) del día.
// La lógica es la que usan los day-traders con GEX:
//  · Régimen POSITIVO (net GEX > 0): el precio queda "pegado" entre el put wall y
//    el call wall → operar RANGO (rebotes en los muros, deriva al imán).
//  · Régimen NEGATIVO (net GEX < 0): los muros no aguantan → operar RUPTURA
//    (momentum al romper un muro).
// Cada idea trae entrada, objetivo, stop-loss y el porqué, en lenguaje llano.
// NO cotiza contratos: da el plan sobre el subyacente/índice para que la usuaria
// arme el 0DTE en su bróker. Es guía de estudio, no consejo financiero.
// ============================================================================

import type { DayGexLevels } from "./dayGex";

export interface DayIdea {
  bias: "alcista" | "bajista" | "neutral";
  title: string;
  entry: string;
  target: string;
  stop: string;
  why: string;
  confidence: "alta" | "media" | "baja";
}

const f = (n: number | null): string =>
  n == null ? "—" : n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2);

export function dayTradeIdeas(g: DayGexLevels): DayIdea[] {
  const ideas: DayIdea[] = [];
  const { spot, callWall, putWall, magnet, gammaFlip, regime } = g;
  if (!(spot > 0)) return ideas;

  const near = (a: number | null, pct = 0.004) => a != null && Math.abs(spot - a) / spot <= pct;

  if (regime === "positive") {
    // Mercado de RANGO: rebotes en los muros + deriva al imán.
    if (putWall != null) {
      ideas.push({
        bias: "alcista",
        title: `Rebote alcista desde el Put Wall ${f(putWall)}`,
        entry: `Si el precio TOCA y aguanta arriba de ${f(putWall)} (el soporte de gamma).`,
        target: magnet != null && magnet > putWall ? `Imán ${f(magnet)}` : callWall != null ? `Call Wall ${f(callWall)}` : "el siguiente nivel arriba",
        stop: `Cierre claro por DEBAJO de ${f(putWall)} (ahí el soporte se rompe).`,
        why: "En gamma positiva los dealers compran las bajas: el Put Wall actúa como piso y el precio tiende a rebotar hacia el imán.",
        confidence: near(putWall) ? "alta" : "media",
      });
    }
    if (callWall != null) {
      ideas.push({
        bias: "bajista",
        title: `Rechazo bajista en el Call Wall ${f(callWall)}`,
        entry: `Si el precio SUBE hasta ${f(callWall)} y se frena (la resistencia de gamma).`,
        target: magnet != null && magnet < callWall ? `Imán ${f(magnet)}` : putWall != null ? `Put Wall ${f(putWall)}` : "el siguiente nivel abajo",
        stop: `Cierre claro por ARRIBA de ${f(callWall)} (ahí la resistencia cede).`,
        why: "En gamma positiva los dealers venden las subidas: el Call Wall actúa como techo y el precio suele devolverse hacia el imán.",
        confidence: near(callWall) ? "alta" : "media",
      });
    }
    if (magnet != null && Math.abs(spot - magnet) / spot > 0.003) {
      ideas.push({
        bias: magnet > spot ? "alcista" : "bajista",
        title: `Deriva al imán ${f(magnet)}`,
        entry: `Entrada a favor de la dirección al imán mientras el precio esté ${magnet > spot ? "por debajo" : "por encima"} de ${f(magnet)}.`,
        target: `Imán ${f(magnet)} (mayor concentración de gamma).`,
        stop: `${magnet > spot ? `Debajo del Put Wall ${f(putWall)}` : `Arriba del Call Wall ${f(callWall)}`}.`,
        why: "El imán es el strike de mayor gamma; en régimen pegajoso el precio tiende a ser atraído ahí al cierre.",
        confidence: "media",
      });
    }
  } else {
    // Mercado VOLÁTIL / de TENDENCIA: ruptura de muros con momentum.
    if (callWall != null) {
      ideas.push({
        bias: "alcista",
        title: `Ruptura alcista sobre el Call Wall ${f(callWall)}`,
        entry: `Si el precio ROMPE con fuerza arriba de ${f(callWall)}.`,
        target: "Extensión al alza (sin techo de gamma cercano).",
        stop: `Regreso por debajo de ${f(callWall)} (ruptura falsa).`,
        why: "En gamma negativa los dealers persiguen el precio: al romper el Call Wall el movimiento se acelera en vez de frenarse.",
        confidence: near(callWall) ? "alta" : "media",
      });
    }
    if (putWall != null) {
      ideas.push({
        bias: "bajista",
        title: `Ruptura bajista bajo el Put Wall ${f(putWall)}`,
        entry: `Si el precio ROMPE con fuerza debajo de ${f(putWall)}.`,
        target: "Extensión a la baja (sin piso de gamma cercano).",
        stop: `Regreso por arriba de ${f(putWall)} (ruptura falsa).`,
        why: "En gamma negativa la caída se acelera: al perder el Put Wall los dealers venden más, empujando el precio abajo.",
        confidence: near(putWall) ? "alta" : "media",
      });
    }
    if (gammaFlip != null) {
      ideas.push({
        bias: spot > gammaFlip ? "alcista" : "bajista",
        title: `Vigila el Gamma Flip ${f(gammaFlip)}`,
        entry: `El precio está ${spot > gammaFlip ? "ARRIBA" : "ABAJO"} del flip (${f(gammaFlip)}).`,
        target: spot > gammaFlip ? "Mientras siga arriba, sesgo alcista." : "Mientras siga abajo, sesgo bajista.",
        stop: `Cruce del flip ${f(gammaFlip)} = cambia el régimen, sal de la idea.`,
        why: "El Gamma Flip separa el mercado pegajoso (arriba) del volátil (abajo). Cruzarlo cambia todo el comportamiento.",
        confidence: "media",
      });
    }
  }

  return ideas;
}
