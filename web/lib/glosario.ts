// 📖 Glosario — cada palabra rara de opciones, dicha en cristiano.
//
// Regla de Nagimi: ningún tecnicismo aparece solo en pantalla. O se traduce, o
// va con su explicación al lado. Este archivo es la única fuente de esas
// explicaciones, para que la misma palabra no se explique de tres maneras
// distintas en tres pantallas.
//
// `simple` es el nombre que se pinta (lo que entiende cualquiera).
// `termino` es la palabra técnica (se deja de apoyo, chiquita, porque en el
// bróker sí sale así y hay que reconocerla).
// `explica` es una frase de una línea, sin más tecnicismos dentro.

export type Entrada = {
  /** La palabra técnica, tal como sale en el bróker. */
  termino: string;
  /** Cómo se dice sin tecnicismos. */
  simple: string;
  /** Una frase que lo explica sin usar otra palabra rara. */
  explica: string;
};

const LISTA: Entrada[] = [
  { termino: "VWAP", simple: "Precio promedio del día",
    explica: "El precio al que de verdad se compró y vendió hoy, pesando más donde hubo más acciones. Si el precio va por encima, los compradores mandan." },
  { termino: "Volumen", simple: "Acciones negociadas",
    explica: "Cuántas acciones cambiaron de mano hoy. Mucho volumen es mucha gente mirando; poco volumen hace que el movimiento valga menos." },
  { termino: "Strike", simple: "Precio pactado",
    explica: "El precio al que el contrato te deja comprar o vender la acción." },
  { termino: "Prima", simple: "Lo que te pagan",
    explica: "El dinero que recibes por vender el contrato, o que pagas por comprarlo." },
  { termino: "Call", simple: "Apuesta a que sube",
    explica: "Contrato que gana si la acción sube del precio pactado." },
  { termino: "Put", simple: "Apuesta a que baja",
    explica: "Contrato que gana si la acción baja del precio pactado." },
  { termino: "Call wall", simple: "Techo",
    explica: "El precio donde hay tanto dinero apostado que la acción suele frenar al subir." },
  { termino: "Put wall", simple: "Suelo",
    explica: "El precio donde hay tanto dinero apostado que la acción suele frenar al bajar." },
  { termino: "Magnet", simple: "Imán",
    explica: "El precio hacia el que la acción tiende a volver mientras no pase nada raro." },
  { termino: "Max pain", simple: "El precio que menos le duele a Wall Street",
    explica: "El precio donde más contratos vencen sin valer nada, o sea donde menos plata pierde quien los vendió." },
  { termino: "GEX", simple: "Dinero de opciones apilado",
    explica: "Cuánto dinero en contratos hay parado en cada precio. Donde hay más, el precio cuesta más de atravesar." },
  { termino: "Gamma positiva", simple: "Día de rango",
    explica: "Los que venden contratos empujan contra el movimiento, así que la acción tiende a quedarse encerrada entre dos precios." },
  { termino: "Gamma negativa", simple: "Día de empujón",
    explica: "Los que venden contratos empujan a favor del movimiento, así que si arranca para un lado, se estira." },
  { termino: "Gamma flip", simple: "El precio donde cambia el día",
    explica: "El precio que separa el día tranquilo del día que se estira. Cruzarlo cambia el carácter de la sesión." },
  { termino: "IV", simple: "Nerviosismo del mercado",
    explica: "Cuánto movimiento espera la gente. Mientras más nervioso, más caras están las opciones." },
  { termino: "IV crush", simple: "Bajón de nerviosismo",
    explica: "Después de una noticia esperada, los contratos se abaratan de golpe aunque la acción no se mueva." },
  { termino: "Theta", simple: "Lo que gotea por día",
    explica: "El dinero que el contrato pierde cada día solo porque pasa el tiempo. Si vendes, eso juega a tu favor." },
  { termino: "Delta", simple: "Cuánto se mueve contigo",
    explica: "Cuánto sube o baja el contrato si la acción se mueve un dólar." },
  { termino: "DTE", simple: "Días para el vencimiento",
    explica: "Cuántos días le quedan al contrato antes de que se acabe." },
  { termino: "0DTE", simple: "Vence hoy",
    explica: "El contrato se acaba al cierre de hoy: gana o se hace cero en unas horas." },
  { termino: "Vencimiento", simple: "La fecha en que se acaba",
    explica: "El día en que el contrato deja de existir y se cuenta si ganó o no." },
  { termino: "Spread de crédito", simple: "Venta con techo de pérdida",
    explica: "Vendes un contrato y compras otro más lejos. Cobras menos, pero tu pérdida máxima queda amarrada." },
  { termino: "Colateral", simple: "Dinero que te congelan",
    explica: "La plata que el bróker te aparta mientras la operación está abierta." },
  { termino: "POP", simple: "Probabilidad de ganar",
    explica: "De cada 100 veces que hagas esta misma operación, cuántas terminan en ganancia." },
  { termino: "Expected move", simple: "Movimiento esperado",
    explica: "Lo que el mercado está pagando por asumir que la acción se mueva de aquí a que se acabe el contrato." },
  { termino: "ITM", simple: "Ya está dentro",
    explica: "El contrato ya vale algo si se acabara ahora mismo." },
  { termino: "OTM", simple: "Todavía está fuera",
    explica: "Si se acabara ahora mismo, el contrato no valdría nada." },
  { termino: "Earnings", simple: "Reporte de ganancias",
    explica: "El día que la empresa dice cuánto ganó. La acción suele pegar un brinco." },
  { termino: "Open interest", simple: "Contratos vivos",
    explica: "Cuántos contratos de ese precio siguen abiertos. Mide cuánta gente hay metida ahí." },
  { termino: "Bid", simple: "Lo que te ofrecen",
    explica: "Lo que te pagan si vendes ahora mismo, sin regatear." },
  { termino: "Ask", simple: "Lo que te piden",
    explica: "Lo que te cobran si compras ahora mismo, sin regatear." },
  { termino: "Soporte", simple: "Suelo",
    explica: "Un precio donde la acción ya frenó de bajar otras veces." },
  { termino: "Resistencia", simple: "Techo",
    explica: "Un precio donde la acción ya frenó de subir otras veces." },
  { termino: "RSI", simple: "Termómetro de estirón",
    explica: "Mide si la acción subió o bajó demasiado seguido. Sobre 70 va muy estirada; bajo 30 va muy castigada." },
  { termino: "EMA", simple: "Línea de tendencia",
    explica: "El promedio del precio dando más peso a los días recientes. Sirve para ver para dónde va la cosa." },
  { termino: "ATR", simple: "Cuánto se mueve normalmente",
    explica: "El brinco típico de esa acción en un día. Sirve para saber si lo de hoy es raro o normal." },
];

/** Índice por la palabra técnica en minúscula, para buscar sin importar mayúsculas. */
const INDICE = new Map(LISTA.map((e) => [e.termino.toLowerCase(), e]));

/** Todas las entradas, en el orden en que se escribieron. */
export function glosario(): Entrada[] {
  return LISTA;
}

/** Busca una palabra técnica. Devuelve null si no está en el glosario. */
export function definir(termino: string): Entrada | null {
  return INDICE.get(termino.trim().toLowerCase()) ?? null;
}

/**
 * El nombre simple de una palabra técnica. Si no está en el glosario,
 * devuelve la palabra tal cual — nunca inventa una traducción.
 */
export function enSimple(termino: string): string {
  return definir(termino)?.simple ?? termino;
}
