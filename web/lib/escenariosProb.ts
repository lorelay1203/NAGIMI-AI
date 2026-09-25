// ============================================================================
// Probabilidad de CADA escenario (alcista / neutral / bajista), sumando 100.
//
// Los escenarios de Nagimi traen "probabilidad de TOCAR" cada objetivo, que no
// suma 100 y confunde en una tabla. FinAnalista muestra un reparto tipo
// 40% / 37% / 23%. Esto hace lo mismo pero con la matemática honesta: reparte
// el precio final en tres zonas usando la misma lognormal del cono.
//
// Los cortes van a la mitad entre escenarios: si el precio acaba más cerca del
// objetivo alcista que del base, cuenta como alcista.
// ============================================================================

import { normCdf } from "./expectedMove";

export interface RepartoEscenarios {
  bajista: number;   // %
  neutral: number;   // %
  alcista: number;   // %
  /** Los cortes usados, por si hay que enseñarlos. */
  corteBajo: number;
  corteAlto: number;
}

/** P(precio final < x) con deriva cero, la convención del mercado de opciones. */
function probMenorQue(x: number, spot: number, iv: number, dias: number): number {
  const T = Math.max(dias, 0) / 365;
  const sd = Math.max(iv, 0.01) * Math.sqrt(Math.max(T, 1e-9));
  if (!(x > 0) || !(spot > 0) || sd <= 0) return 0;
  return normCdf((Math.log(x / spot) + (sd * sd) / 2) / sd);
}

/**
 * Reparte 100% entre los tres escenarios. Devuelve enteros que suman 100
 * exactamente (el redondeo sobrante se le da al escenario más grande, así
 * nunca sale "99%" ni "101%" en pantalla).
 */
export function repartoEscenarios(input: {
  spot: number;
  iv: number;
  dias: number;
  bear: number;
  base: number;
  bull: number;
}): RepartoEscenarios | null {
  const { spot, iv, dias, bear, base, bull } = input;
  if (!(spot > 0) || !(iv > 0) || !(dias > 0)) return null;
  if (!(bear < base && base < bull)) return null;

  const corteBajo = (bear + base) / 2;
  const corteAlto = (base + bull) / 2;

  const pBajo = probMenorQue(corteBajo, spot, iv, dias);
  const pHastaAlto = probMenorQue(corteAlto, spot, iv, dias);
  const crudo = [pBajo * 100, (pHastaAlto - pBajo) * 100, (1 - pHastaAlto) * 100];

  const enteros = crudo.map((x) => Math.round(x));
  const sobra = 100 - enteros.reduce((a, b) => a + b, 0);
  if (sobra !== 0) {
    const mayor = enteros.indexOf(Math.max(...enteros));
    enteros[mayor] += sobra;
  }

  return { bajista: enteros[0], neutral: enteros[1], alcista: enteros[2], corteBajo, corteAlto };
}

/** Por qué ese escenario es el que es, en llano y según el régimen del día. */
export function porQueEscenario(
  cual: "alcista" | "neutral" | "bajista",
  regimen: "positive" | "negative",
  esElMasProbable: boolean,
): string {
  const pegajoso = regimen === "positive";
  if (cual === "neutral") {
    return pegajoso
      ? "Es el caso del imán: hoy es día de rango, o sea que los que vendieron los contratos frenan los extremos y el precio se queda dando vueltas cerca del centro."
      : "Es el caso de que no pase nada raro: el precio se queda cerca de donde está, aunque hoy es día de empujón y eso hace menos probable la calma.";
  }
  const lado = cual === "alcista" ? "arriba" : "abajo";
  if (pegajoso) {
    return `El precio tendría que romper ${lado === "arriba" ? "el techo" : "el suelo"} de gamma y sostenerse. `
      + `Hoy es día de rango, y eso cuesta más porque los que vendieron los contratos empujan de vuelta al centro`
      + `${esElMasProbable ? " — aun así, es el escenario con más peso hoy" : ""}.`;
  }
  return `Hoy es día de empujón: los que vendieron los contratos empujan a favor, así que si el precio arranca ${lado}, `
    + `acelera en vez de frenarse${esElMasProbable ? ", y hoy es el lado con más peso" : ""}.`;
}
