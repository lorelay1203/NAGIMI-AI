// ============================================================================
// "Plan de operación" — la sección más accionable de Aetheris (Niveles Clave),
// adaptada al flujo de opciones de Nagimi.
//
// En vez de solo decir "sube o baja", da un plan concreto en llano:
//   entra aquí · sal aquí si va mal · ganas N por cada 1 que arriesgas.
//
// Todo sale de datos que Nagimi YA calcula: el precio, los escenarios
// (bear/base/bull) y los muros de gamma (los niveles). No inventa nada — si no
// hay una lectura con lado claro, no da plan (igual que Aetheris no fuerza uno).
// Puro y testable: sin red ni disco.
// ============================================================================

import type { ProPrediction } from "./prediction";
import type { LevelProb } from "./expectedMove";

export interface PlanOperacion {
  /** "alcista" = plan para que suba; "bajista" = para que baje. */
  lado: "alcista" | "bajista";
  /** Zona de entrada: entre estos dos precios. */
  entradaBaja: number;
  entradaAlta: number;
  /** Si el precio cruza esto, la lectura se rompió — salir. */
  stop: number;
  /** A dónde apunta si la lectura funciona (target base). */
  objetivo: number;
  /** % del precio de entrada hasta el stop (lo que arriesgas). */
  riesgoPct: number;
  /** % del precio de entrada hasta el objetivo (lo que puedes ganar). */
  gananciaPct: number;
  /** Recompensa por unidad de riesgo: gananciaPct / riesgoPct. */
  ratio: number;
  /** Frase completa en llano, lista para mostrar. */
  narracion: string;
}

/** Por debajo de esta confianza, la lectura no da para un plan (es adivinar). */
const CONF_MINIMA = 33;
/** Colchón bajo el soporte para el stop si no hay un segundo nivel. */
const COLCHON_STOP = 0.02;

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
const pct1 = (n: number) => `${n.toFixed(1)}%`;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Arma el plan a partir de la predicción. Devuelve null cuando no hay una
 * lectura con lado claro (lateral, confianza baja, o faltan niveles) — en esos
 * casos forzar un plan sería inventar.
 */
export function buildPlan(prediction: ProPrediction): PlanOperacion | null {
  const { spot, direction, confidence, base } = prediction;
  if (!(spot > 0)) return null;
  // Si la predicción trae aviso (datos no fiables, "no operar"), no se da plan:
  // sería contradecir al propio veredicto. Mismo criterio que la salvaguarda
  // de liquidez del VeredictoCard.
  if (prediction.caveat) return null;
  if (direction === "flat" || confidence < CONF_MINIMA) return null;

  const alcista = direction === "up";
  const levels: LevelProb[] = prediction.levels ?? [];

  // Muros por debajo (pisos) y por encima (techos) del precio, más fuertes primero.
  const pisos = levels.filter((l) => l.strike < spot).sort((a, b) => b.strike - a.strike);
  const techos = levels.filter((l) => l.strike > spot).sort((a, b) => a.strike - b.strike);

  if (alcista) {
    // Entrar entre el soporte más cercano y el precio; stop bajo el soporte.
    const soporte = pisos[0]?.strike ?? round2(spot * (1 - COLCHON_STOP));
    const stop = pisos[1]?.strike ?? round2(soporte * (1 - COLCHON_STOP));
    const objetivo = base.target > spot ? base.target : (techos[0]?.strike ?? prediction.bull.target);
    return armar("alcista", soporte, spot, stop, objetivo);
  }

  // Bajista: entrar entre el precio y la resistencia; stop sobre la resistencia.
  const resistencia = techos[0]?.strike ?? round2(spot * (1 + COLCHON_STOP));
  const stop = techos[1]?.strike ?? round2(resistencia * (1 + COLCHON_STOP));
  const objetivo = base.target < spot ? base.target : (pisos[0]?.strike ?? prediction.bear.target);
  return armar("bajista", spot, resistencia, stop, objetivo);
}

/** Calcula métricas y redacta la narración. Devuelve null si los números no cuadran. */
function armar(
  lado: "alcista" | "bajista",
  entradaBaja: number,
  entradaAlta: number,
  stop: number,
  objetivo: number,
): PlanOperacion | null {
  const eBaja = Math.min(entradaBaja, entradaAlta);
  const eAlta = Math.max(entradaBaja, entradaAlta);
  const entrada = (eBaja + eAlta) / 2;
  if (!(entrada > 0)) return null;

  const alcista = lado === "alcista";
  // El stop tiene que estar del lado correcto y el objetivo del otro; si no,
  // la lectura es incoherente y no se da plan (no se fuerza un número feo).
  if (alcista && !(stop < entrada && objetivo > entrada)) return null;
  if (!alcista && !(stop > entrada && objetivo < entrada)) return null;

  const riesgo = Math.abs(entrada - stop);
  const ganancia = Math.abs(objetivo - entrada);
  if (!(riesgo > 0) || !(ganancia > 0)) return null;

  const riesgoPct = round2((riesgo / entrada) * 100);
  const gananciaPct = round2((ganancia / entrada) * 100);
  const ratio = round2(ganancia / riesgo);

  const dirVerbo = alcista ? "baja" : "sube";
  const ratioTxt = ratio >= 1
    ? `ganas ${ratio.toFixed(1)} por cada 1 que arriesgas`
    : `arriesgas más de lo que puedes ganar (solo ${ratio.toFixed(1)} por cada 1)`;

  const narracion =
    `Entra entre ${money(eBaja)} y ${money(eAlta)}. `
    + `Si ${dirVerbo} de ${money(stop)}, sal — ahí la lectura se rompió (${pct1(riesgoPct)}). `
    + `Si llega a ${money(objetivo)} (${pct1(gananciaPct)}), ${ratioTxt}.`;

  return { lado, entradaBaja: eBaja, entradaAlta: eAlta, stop, objetivo, riesgoPct, gananciaPct, ratio, narracion };
}
