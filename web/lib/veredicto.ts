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

/** ¿Es este strike prácticamente el mismo número que alguno ya mostrado? */
function esCasiTarget(strike: number, ...targets: number[]): boolean {
  return targets.some((t) => Math.abs(strike - t) / Math.max(t, 1) <= 0.005);
}

/**
 * El nivel a VIGILAR: NO el target (eso ya lo dice "a favor") NI el objetivo del
 * escenario en contra (eso ya lo dice "en contra"), sino el otro riel — el piso
 * donde suele frenar una caída si la señal es alcista, o el techo si es bajista.
 *
 * Repetir el mismo precio en dos cajas no aporta nada y confunde: parece que el
 * agente dice dos cosas cuando dice una sola. Por eso se descartan los números
 * que ya están en pantalla.
 *
 * Devuelve null si no hay ningún nivel nuevo que mostrar.
 */
export function rielAVigilar(
  levels: LevelProb[],
  spot: number,
  direction: ProPrediction["direction"],
  baseTarget: number,
  /** Otros precios ya visibles en el veredicto (típicamente el "en contra"). */
  yaMostrados: number[] = [],
): RielVigilar | null {
  const porFuerza = [...levels].sort((a, b) => b.magnet - a.magnet);
  const ocupados = [baseTarget, ...yaMostrados];
  const libre = (l: LevelProb) => !esCasiTarget(l.strike, ...ocupados);

  // Preferencia según la dirección: piso para alcista, techo para bajista.
  const preferido =
    direction === "up" ? porFuerza.find((l) => l.strike < spot && libre(l))
    : direction === "down" ? porFuerza.find((l) => l.strike > spot && libre(l))
    : porFuerza.find(libre);

  // Si no hay en el lado preferido, cualquier imán fuerte que no esté ya en pantalla.
  const elegido = preferido ?? porFuerza.find(libre) ?? null;
  if (!elegido) return null;

  return { strike: elegido.strike, esPiso: elegido.strike < spot };
}
