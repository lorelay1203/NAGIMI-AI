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
        title: `Rebote hacia arriba desde el suelo ${f(putWall)}`,
        entry: `Si el precio TOCA y aguanta arriba de ${f(putWall)} (el soporte de gamma).`,
        target: magnet != null && magnet > putWall ? `Imán ${f(magnet)}` : callWall != null ? `Call Wall ${f(callWall)}` : "el siguiente nivel arriba",
        stop: `Cierre claro por DEBAJO de ${f(putWall)} (ahí el soporte se rompe).`,
        why: "Hoy es día de rango: los que vendieron los contratos tienen que comprar cuando el precio baja, así que ese suelo aguanta y el precio suele devolverse hacia el imán.",
        confidence: near(putWall) ? "alta" : "media",
      });
    }
    if (callWall != null) {
      ideas.push({
        bias: "bajista",
        title: `Rechazo hacia abajo en el techo ${f(callWall)}`,
        entry: `Si el precio SUBE hasta ${f(callWall)} y se frena (la resistencia de gamma).`,
        target: magnet != null && magnet < callWall ? `Imán ${f(magnet)}` : putWall != null ? `Put Wall ${f(putWall)}` : "el siguiente nivel abajo",
        stop: `Cierre claro por ARRIBA de ${f(callWall)} (ahí la resistencia cede).`,
        why: "Hoy es día de rango: los que vendieron los contratos tienen que vender cuando el precio sube, así que ese techo aguanta y el precio suele devolverse hacia el imán.",
        confidence: near(callWall) ? "alta" : "media",
      });
    }
    if (magnet != null && Math.abs(spot - magnet) / spot > 0.003) {
      ideas.push({
        bias: magnet > spot ? "alcista" : "bajista",
        title: `Deriva al imán ${f(magnet)}`,
        entry: `Entrada a favor de la dirección al imán mientras el precio esté ${magnet > spot ? "por debajo" : "por encima"} de ${f(magnet)}.`,
        target: `Imán ${f(magnet)} (mayor concentración de gamma).`,
        stop: `${magnet > spot ? `Debajo del suelo ${f(putWall)}` : `Arriba del techo ${f(callWall)}`}.`,
        why: "El imán es el precio donde hay más dinero en contratos. En un día de rango, el precio tiende a terminar pegado ahí al cierre.",
        confidence: "media",
      });
    }
  } else {
    // Mercado VOLÁTIL / de TENDENCIA: ruptura de muros con momentum.
    if (callWall != null) {
      ideas.push({
        bias: "alcista",
        title: `Ruptura hacia arriba sobre el techo ${f(callWall)}`,
        entry: `Si el precio ROMPE con fuerza arriba de ${f(callWall)}.`,
        target: "Extensión al alza (sin techo de gamma cercano).",
        stop: `Regreso por debajo de ${f(callWall)} (ruptura falsa).`,
        why: "Hoy es día de empujón: los que vendieron los contratos tienen que perseguir el precio, así que si rompe ese techo el movimiento se estira en vez de frenarse.",
        confidence: near(callWall) ? "alta" : "media",
      });
    }
    if (putWall != null) {
      ideas.push({
        bias: "bajista",
        title: `Ruptura hacia abajo bajo el suelo ${f(putWall)}`,
        entry: `Si el precio ROMPE con fuerza debajo de ${f(putWall)}.`,
        target: "Extensión a la baja (sin piso de gamma cercano).",
        stop: `Regreso por arriba de ${f(putWall)} (ruptura falsa).`,
        why: "Hoy es día de empujón: si pierde ese suelo, los que vendieron los contratos tienen que vender más, y eso hunde el precio todavía más rápido.",
        confidence: near(putWall) ? "alta" : "media",
      });
    }
    if (gammaFlip != null) {
      ideas.push({
        bias: spot > gammaFlip ? "alcista" : "bajista",
        title: `Vigila el punto donde cambia el día ${f(gammaFlip)}`,
        entry: `El precio está ${spot > gammaFlip ? "ARRIBA" : "ABAJO"} del flip (${f(gammaFlip)}).`,
        target: spot > gammaFlip ? "Mientras siga arriba, sesgo alcista." : "Mientras siga abajo, sesgo bajista.",
        stop: `Si cruza el punto de cambio ${f(gammaFlip)}, el día cambia de carácter: sal de la idea.`,
        why: "Este es el precio donde cambia el día: por encima el mercado se queda tranquilo en un rango, por debajo se estira. Cruzarlo cambia todo.",
        confidence: "media",
      });
    }
  }

  return ideas;
}
