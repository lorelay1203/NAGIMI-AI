// ============================================================================
// "El porqué" de cada caja del veredicto — en el mismo lenguaje de la analogía
// de la canica, no en jerga de opciones.
//
// Las cajas A FAVOR / EN CONTRA / VIGILA decían un número y un `driver` crudo
// ("Nivel imán: 9% del peso del mapa está en $225.00"). Eso no explica NADA a
// quien no sabe qué es un imán de gamma. Aquí se traduce el MECANISMO: por qué
// el precio tiende hacia ahí, por qué el otro lado no es descabellado, y por
// qué un muro frena.
//
// Puro y testable: recibe números ya calculados, devuelve texto. No inventa.
// ============================================================================

export type Regimen = "positive" | "negative" | undefined;

/** Un nivel del mapa de gamma, con lo mínimo para explicarlo. */
export interface NivelImanLike {
  strike: number;
  /** Peso del nivel en el mapa (0-1). */
  magnet: number;
  side: "call" | "put";
}

const d2 = (n: number) => n.toFixed(2);
const pct0 = (p: number) => `${Math.round(p * 100)}%`;

/** El horizonte dicho como lo diría una persona. */
export function horizonteTxt(days: number): string {
  if (days <= 10) return "la próxima semana";
  if (days <= 20) return "las próximas dos semanas";
  return "el próximo mes";
}

/** El nivel más pesado del mapa que esté pegado a un precio dado. */
export function imanCercaDe<T extends { strike: number; magnet: number }>(
  levels: T[],
  precio: number,
  toleranciaPct = 1,
): T | null {
  let mejor: T | null = null;
  for (const l of levels) {
    const dist = (Math.abs(l.strike - precio) / Math.max(precio, 1)) * 100;
    if (dist > toleranciaPct) continue;
    if (!mejor || l.magnet > mejor.magnet) mejor = l;
  }
  return mejor;
}

/** Cómo el régimen de gamma cambia la fuerza del imán. */
function matizRegimen(regimen: Regimen): string {
  if (regimen === "positive") {
    return " Y hoy eso pesa MÁS de lo normal: la gamma está positiva, o sea que "
      + "cada vez que el precio se aleja, esa misma cobertura lo empuja de vuelta "
      + "(la canica rodando al centro del tazón).";
  }
  if (regimen === "negative") {
    return " Pero ojo: hoy la gamma está negativa, o sea que la cobertura empuja "
      + "en la MISMA dirección del movimiento. El imán agarra menos y el precio se "
      + "puede ir de largo sin frenar.";
  }
  return "";
}

/**
 * A FAVOR: de dónde sale el target y qué significa de verdad esa probabilidad.
 * Lo más importante que aclara: 90% no es "va a cerrar ahí", es "es muy
 * probable que lo TOQUE en algún momento" — la confusión clásica.
 */
export function porQueAFavor(input: {
  spot: number;
  target: number;
  probability: number;
  iman: NivelImanLike | null;
  regimen: Regimen;
  horizonDays: number;
}): string {
  const { spot, target, probability, iman, regimen, horizonDays } = input;

  const origen = iman
    ? `Ese $${d2(target)} no es un número inventado: es donde está amontonado el `
      + `dinero en opciones. El ${Math.round(iman.magnet * 100)}% de todo el peso del mapa `
      + `está pegado a ese precio, del lado de los ${iman.side === "call" ? "calls" : "puts"}. `
      + `Los que vendieron esas opciones tienen que cubrirse comprando y vendiendo acciones, `
      + `y esa cobertura hala el precio hacia allá — por eso se le llama imán.`
    : `Ese $${d2(target)} sale del movimiento que la volatilidad de hoy considera normal, `
      + `no de un muro de opciones: no hay suficiente dinero amontonado en un precio pactado como `
      + `para halar el precio. Tómalo como una referencia floja, no como un ancla.`;

  // Cuando el imán está encima del precio, la probabilidad de TOCAR sale ~100% y
  // decir "100% de probabilidad" suena a promesa de ganancia. No lo es: ya está ahí.
  const yaPegado = Math.abs(target - spot) / Math.max(spot, 1) <= 0.01 || probability >= 0.97;

  const ojo = yaPegado
    ? `Ese ${pct0(probability)} no es una promesa de ganancia: el imán está prácticamente `
      + `encima del precio de ahora ($${d2(spot)}), así que tocarlo es casi un trámite — `
      + `ya está ahí. Lo difícil no es que lo TOQUE, es que se QUEDE. Aquí lo que te dice `
      + `la lectura es "el precio está anclado", no "vas a ganar".`
    : `Ojo con el ${pct0(probability)}: NO quiere decir que va a cerrar en `
      + `$${d2(target)}. Quiere decir que es muy probable que lo TOQUE en algún momento de `
      + `${horizonteTxt(horizonDays)}. Tocarlo y quedarse ahí son dos cosas distintas — `
      + `si vas a operar esto, ten claro dónde tomas la ganancia cuando lo toque.`;

  return `${origen}${iman ? matizRegimen(regimen) : ""} ${ojo}`;
}

/**
 * EN CONTRA: no es un pronóstico, es el tamaño del golpe posible. Se explica con
 * el cono del movimiento esperado — "esto cabe dentro de lo normal de hoy".
 */
export function porQueEnContra(input: {
  target: number;
  probability: number;
  /** 1σ en % del spot para el horizonte. */
  sigmaPct: number;
  horizonDays: number;
  /** El muro que sostiene ese escenario, si lo hay. */
  muro: NivelImanLike | null;
}): string {
  const { target, probability, sigmaPct, horizonDays, muro } = input;

  const rango = `Esto no es una predicción de que va a pasar: es el tamaño del golpe `
    + `si te toca el lado malo. Con la volatilidad de hoy, este ticker se mueve `
    + `±${sigmaPct.toFixed(1)}% en ${horizonteTxt(horizonDays)} sin que nadie se sorprenda. `
    + `$${d2(target)} cae dentro de ese rango normal, y hay ${pct0(probability)} de probabilidad `
    + `de que lo toque.`;

  const porQueAhi = muro
    ? ` Se para justo ahí porque hay otro amontonamiento de dinero en $${d2(muro.strike)} `
      + `(${Math.round(muro.magnet * 100)}% del mapa, lado ${muro.side === "call" ? "calls" : "puts"}): `
      + `si el precio se gira, ese es el primer lugar donde encontraría algo que lo detenga.`
    : ` No hay un muro de opciones ahí: el número sale puro de la volatilidad, de hasta `
      + `dónde llega un movimiento normal. Por eso no hay nada que garantice que se frene.`;

  const cierre = ` Mira este número ANTES de decidir cuánto metes: si ese golpe te duele `
    + `demasiado, la posición es muy grande, no importa lo buena que se vea la señal.`;

  return `${rango}${porQueAhi}${cierre}`;
}

/**
 * VIGILA: por qué un muro frena — el mecanismo de la cobertura, y la advertencia
 * de que si se rompe, del otro lado hay mucho menos que lo detenga.
 */
export function porQueVigila(input: {
  strike: number;
  esPiso: boolean;
  side: "call" | "put" | null;
  regimen: Regimen;
}): string {
  const { strike, esPiso, side, regimen } = input;

  const quien = side === "put"
    ? "mucha gente compró protección (puts) a ese precio"
    : side === "call"
      ? "mucha gente compró calls a ese precio"
      : "hay una concentración fuerte de contratos en ese precio";

  const mecanismo = esPiso
    ? `Los que vendieron esos contratos quedan expuestos si el precio baja hasta ahí, `
      + `así que tienen que salir a COMPRAR para cubrirse — y esa compra frena la caída. `
      + `Es caer sobre colchones en vez de caer sobre el piso pelado.`
    : `Los que vendieron esos contratos quedan expuestos si el precio sube hasta ahí, `
      + `así que tienen que salir a VENDER para cubrirse — y esa venta frena la subida. `
      + `Es como darse contra un techo bajito.`;

  const roto = esPiso
    ? `Y no es garantía: si ese piso se rompe, más abajo hay mucho menos dinero `
      + `sosteniendo, así que la caída se acelera. Por eso $${d2(strike)} es tu alerta — `
      + `no para entrar a ciegas, sino para saber si aguantó o cedió.`
    : `Y no es garantía: si ese techo se rompe, más arriba hay mucho menos contra qué `
      + `chocar, así que la subida se acelera. Por eso $${d2(strike)} es tu alerta — `
      + `no para entrar a ciegas, sino para saber si aguantó o cedió.`;

  const extra = regimen === "negative"
    ? ` Hoy además la gamma está negativa: los muros aguantan menos de lo normal, `
      + `porque la cobertura empuja a favor del movimiento en vez de en contra.`
    : regimen === "positive"
      ? ` Hoy la gamma está positiva, así que este tipo de nivel suele aguantar mejor.`
      : "";

  return `¿Por qué $${d2(strike)} y no otro número? Porque ahí ${quien}. ${mecanismo} ${roto}${extra}`;
}
