// ============================================================================
// Qué es cada estrategia, en cristiano.
//
// Vive aparte para que la MISMA explicación se use en dos sitios: el porqué que
// aparece al tocar un trade del diario, y la chuleta de la pantalla. Si algún
// día se afina un texto, se afina en un solo lugar.
//
// Las dos familias:
//   · VENDER prima (crédito): cobras por adelantado y ganas si NO pasa nada raro.
//     Ganas poco y seguido; cuando pierdes, pierdes más de lo que cobraste.
//   · COMPRAR prima (débito): pagas por adelantado y ganas si el precio SÍ se
//     mueve. Pierdes poco y seguido; cuando aciertas, el pago es grande.
// ============================================================================

export type StratKind =
  | "iron_condor" | "put_credit" | "call_credit"      // vender prima
  | "long_call" | "long_put"                          // comprar simple
  | "call_debit" | "put_debit"                        // comprar con techo (spread)
  | "straddle" | "strangle";                          // apostar al movimiento

export type Familia = "vender" | "comprar";
export type Sesgo = "alcista" | "bajista" | "neutral" | "movimiento";

export interface GuiaEstrategia {
  kind: StratKind;
  nombre: string;
  familia: Familia;
  sesgo: Sesgo;
  /** Una línea: qué estás apostando. */
  apuesta: string;
  /** Cómo funciona, en 2-3 frases sin tecnicismos. */
  comoFunciona: string;
  /** Cuándo tiene sentido usarla. */
  cuandoUsarla: string;
  /** Lo que puede salir mal, dicho claro. */
  riesgo: string;
  /** Nota específica para una cuenta pequeña. */
  cuentaChica: string;
}

export const GUIA: Record<StratKind, GuiaEstrategia> = {
  // ---------------------------------------------------------------- vender
  iron_condor: {
    kind: "iron_condor", nombre: "Iron Condor", familia: "vender", sesgo: "neutral",
    apuesta: "A que el precio se queda dentro de un rango.",
    comoFunciona:
      "Vendes un put por debajo y un call por encima del precio, y compras otro put más abajo y otro call más arriba como protección. "
      + "Cobras la prima de los dos que vendiste. Si al vencimiento el precio quedó entre medias, te quedas con todo lo cobrado.",
    cuandoUsarla: "Cuando esperas que la acción se quede tranquila, sin subidas ni caídas fuertes.",
    riesgo: "Si el precio se dispara o se desploma más allá de tus alas, pierdes bastante más de lo que cobraste.",
    cuentaChica: "Son cuatro patas: cuesta más colateral que un spread simple. Suele ser lo primero que no cabe con poco dinero.",
  },
  put_credit: {
    kind: "put_credit", nombre: "Credit Put Spread", familia: "vender", sesgo: "alcista",
    apuesta: "A que el precio NO baja de cierto nivel.",
    comoFunciona:
      "Vendes un put y compras otro más abajo para limitar la pérdida. Cobras la diferencia. "
      + "Mientras la acción se quede por encima del put que vendiste, te quedas con la prima.",
    cuandoUsarla: "Cuando crees que la acción sube o al menos no cae. No hace falta que suba: basta con que no baje.",
    riesgo: "Si cae por debajo, pierdes hasta la diferencia entre los dos strikes, menos lo que cobraste.",
    cuentaChica: "Es la venta de prima más barata. Elige strikes juntos: cuanto más estrechos, menos colateral.",
  },
  call_credit: {
    kind: "call_credit", nombre: "Credit Call Spread", familia: "vender", sesgo: "bajista",
    apuesta: "A que el precio NO sube de cierto nivel.",
    comoFunciona:
      "El espejo del anterior: vendes un call y compras otro más arriba como tope. "
      + "Mientras la acción se quede por debajo del call que vendiste, te quedas con la prima.",
    cuandoUsarla: "Cuando crees que la acción baja o se estanca, o que ya llegó a un techo.",
    riesgo: "Si rompe hacia arriba, pierdes hasta la diferencia entre strikes menos la prima cobrada.",
    cuentaChica: "Igual de accesible que el put spread. Ojo con las acciones que pueden dispararse por noticias.",
  },

  // --------------------------------------------------------------- comprar
  long_call: {
    kind: "long_call", nombre: "Call simple", familia: "comprar", sesgo: "alcista",
    apuesta: "A que el precio SUBE, y bastante.",
    comoFunciona:
      "Compras un call y ya está: una sola pata. Pagas la prima y eso es todo lo que puedes perder. "
      + "Si la acción sube por encima de tu strike más lo que pagaste, empiezas a ganar, y la ganancia no tiene techo.",
    cuandoUsarla: "Cuando esperas un movimiento al alza claro y pronto. Es la más sencilla de entender y ejecutar.",
    riesgo: "Si la acción no se mueve o baja, pierdes toda la prima. Y el tiempo juega en tu contra cada día.",
    cuentaChica: "La favorita con poco dinero: se compra un solo contrato barato y nunca pierdes más de lo que pagaste.",
  },
  long_put: {
    kind: "long_put", nombre: "Put simple", familia: "comprar", sesgo: "bajista",
    apuesta: "A que el precio BAJA, y bastante.",
    comoFunciona:
      "Compras un put. Pagas la prima y eso es tu pérdida máxima. "
      + "Si la acción cae por debajo de tu strike menos lo que pagaste, empiezas a ganar.",
    cuandoUsarla: "Cuando esperas una caída, o para proteger acciones que ya tienes.",
    riesgo: "Si la acción sube o se queda quieta, pierdes toda la prima. El tiempo también corre en tu contra.",
    cuentaChica: "Tan accesible como el call simple. Sirve para aprovechar caídas sin tener que vender nada en corto.",
  },
  call_debit: {
    kind: "call_debit", nombre: "Call Debit Spread", familia: "comprar", sesgo: "alcista",
    apuesta: "A que sube, pero hasta un punto.",
    comoFunciona:
      "Compras un call y vendes otro más arriba. Lo que cobras por el segundo abarata el primero, "
      + "a cambio de poner un techo a la ganancia. Sale bastante más barato que el call solo.",
    cuandoUsarla: "Cuando crees que sube pero no esperas un cohete, o cuando el call solo se te sale de presupuesto.",
    riesgo: "Pierdes lo que pagaste si no sube. La ganancia está topada en la diferencia de strikes.",
    cuentaChica: "Muy útil: convierte un call de $200 en uno de $60. Riesgo topado y coste bajo.",
  },
  put_debit: {
    kind: "put_debit", nombre: "Put Debit Spread", familia: "comprar", sesgo: "bajista",
    apuesta: "A que baja, pero hasta un punto.",
    comoFunciona:
      "Compras un put y vendes otro más abajo. El que vendes abarata la compra y pone un suelo a la ganancia.",
    cuandoUsarla: "Cuando esperas una caída moderada, no un desplome.",
    riesgo: "Pierdes lo pagado si no baja. Ganancia topada.",
    cuentaChica: "La versión asequible del put simple, con el mismo riesgo definido.",
  },
  straddle: {
    kind: "straddle", nombre: "Straddle", familia: "comprar", sesgo: "movimiento",
    apuesta: "A que se mueve MUCHO, sin importar hacia dónde.",
    comoFunciona:
      "Compras un call y un put del MISMO strike, al precio actual. Si la acción se dispara ganas con el call; "
      + "si se desploma ganas con el put. Te da igual la dirección: lo que necesitas es que se mueva fuerte.",
    cuandoUsarla: "Antes de algo que puede sacudir la acción — resultados, una decisión de la Fed, una noticia esperada.",
    riesgo:
      "Pagas DOS primas, así que necesitas un movimiento grande solo para empatar. "
      + "Si la acción se queda quieta, pierdes por los dos lados. Además, tras el evento la volatilidad se desinfla y las dos opciones valen menos aunque aciertes la dirección.",
    cuentaChica: "Es cara: son dos contratos al dinero. Con poco capital casi siempre conviene el strangle.",
  },
  strangle: {
    kind: "strangle", nombre: "Strangle", familia: "comprar", sesgo: "movimiento",
    apuesta: "A que se mueve mucho, pagando menos que el straddle.",
    comoFunciona:
      "Igual que el straddle pero con strikes separados: compras un call por encima y un put por debajo del precio. "
      + "Al estar más lejos, las dos opciones cuestan bastante menos.",
    cuandoUsarla: "Cuando esperas un movimiento fuerte y quieres pagar menos que en un straddle.",
    riesgo: "Necesita un movimiento AÚN MAYOR para ganar, porque partes más lejos. Si no llega, pierdes las dos primas.",
    cuentaChica: "La forma asequible de apostar a un movimiento: suele costar la mitad que un straddle.",
  },
};

export const TODAS: StratKind[] = Object.keys(GUIA) as StratKind[];
export const VENDER: StratKind[] = TODAS.filter((k) => GUIA[k].familia === "vender");
export const COMPRAR: StratKind[] = TODAS.filter((k) => GUIA[k].familia === "comprar");

/** Bloque de explicación para el porqué de un trade concreto. */
export function explicacion(kind: StratKind): string {
  const g = GUIA[kind];
  return [
    `¿Qué es un ${g.nombre}? ${g.apuesta}`,
    g.comoFunciona,
    `Cuándo se usa: ${g.cuandoUsarla}`,
    `Riesgo: ${g.riesgo}`,
    `Con cuenta chica: ${g.cuentaChica}`,
  ].join("\n");
}
