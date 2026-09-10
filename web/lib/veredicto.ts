// ============================================================================
// Lógica pura del veredicto — separada del componente para poder probarla.
//
// El veredicto muestra tres cosas: a favor (target base), en contra (escenario
// opuesto) y VIGILA (el otro riel). Este archivo resuelve las dos que tienen
// enjundia: cuál es el escenario "en contra" y cuál es el nivel a vigilar.
// ============================================================================

import type { ProPrediction, Scenario } from "./prediction";
import type { LevelProb } from "./expectedMove";

/**
 * El escenario EN CONTRA: si la señal es alcista, el riesgo es el bajista y
 * viceversa. En lateral, el que más se mueve (el que más asustaría).
 */
export function escenarioOpuesto(p: Pick<ProPrediction, "direction" | "bear" | "bull">): Scenario {
  if (p.direction === "up") return p.bear;
  if (p.direction === "down") return p.bull;
  return Math.abs(p.bear.changePct) >= Math.abs(p.bull.changePct) ? p.bear : p.bull;
}

export interface RielVigilar {
  strike: number;
  /** El nivel está por debajo del precio (piso) o por encima (techo). */
  esPiso: boolean;
}

/** ¿Es este strike prácticamente el mismo número que el target base? */
function esCasiTarget(strike: number, baseTarget: number): boolean {
  return Math.abs(strike - baseTarget) / Math.max(baseTarget, 1) <= 0.005;
}

/**
 * El nivel a VIGILAR: NO el target (eso ya lo dice "a favor"), sino el otro
 * riel — el piso donde suele frenar una caída si la señal es alcista, o el
 * techo si es bajista. El imán más fuerte del día suele coincidir con el
 * target base; mostrarlo dos veces no aporta nada, así que se descarta.
 *
 * Devuelve null si no hay ningún nivel distinto del target que mostrar.
 */
export function rielAVigilar(
  levels: LevelProb[],
  spot: number,
  direction: ProPrediction["direction"],
  baseTarget: number,
): RielVigilar | null {
  const porFuerza = [...levels].sort((a, b) => b.magnet - a.magnet);

  // Preferencia según la dirección: piso para alcista, techo para bajista.
  const preferido =
    direction === "up" ? porFuerza.find((l) => l.strike < spot)
    : direction === "down" ? porFuerza.find((l) => l.strike > spot)
    : porFuerza.find((l) => !esCasiTarget(l.strike, baseTarget));

  // Si no hay en el lado preferido, cualquier imán fuerte que no sea el target.
  const elegido = preferido ?? porFuerza.find((l) => !esCasiTarget(l.strike, baseTarget)) ?? null;
  if (!elegido) return null;

  return { strike: elegido.strike, esPiso: elegido.strike < spot };
}
