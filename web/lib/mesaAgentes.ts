// ============================================================================
// "Mesa de Agentes" — los sub-agentes de Nagimi presentados como el grid de
// especialistas de Aetheris, pero con una diferencia: los de Nagimi FUNCIONAN
// (los de Aetheris dicen "coming soon"). Cada agente muestra su código, qué
// mira, qué está viendo ahora, y hacia dónde empuja la lectura — con el porqué.
//
// Puro y testable: recibe las partes del scorecard y les pone código, señal y
// explicación. No calcula puntajes (eso ya lo hace el resto de Nagimi).
// ============================================================================

export interface ParteAgente {
  name: string;
  note: string;
  score: number | null;
  weight: number;
}

export interface AgenteDescrito {
  codigo: string;
  nombre: string;
  /** Qué hace este agente, en una línea llana. */
  queHace: string;
  /** Qué está viendo ahora (viene del scorecard). */
  viendo: string;
  score: number | null;
  /** Peso en el puntaje compuesto. 0 si el agente no cuenta para el puntaje. */
  weight: number;
  /** Etiqueta corta de la señal (Alcista/Bajista/Neutral… o propia del agente). */
  senal: string;
  tono: "up" | "down" | "neutral" | "none";
  /** Hacia dónde empuja la lectura y por qué. null si no tiene dato. */
  empuje: string | null;
}

/**
 * La mesa completa, para la página /agentes: los 6 que puntúan + los 2 de
 * contexto. Los pesos son los mismos de WEIGHTS en prediction.ts; los de
 * contexto pesan 0 porque no mueven el puntaje, avisan.
 */
export const CATALOGO: { codigo: string; nombre: string; queHace: string; weight: number; mira: string }[] = [
  { codigo: "AGR", nombre: "Agresividad", weight: 20, mira: "Flujo de opciones",
    queHace: "Mira si el dinero grande entra pagando el ask (compra con prisa) o golpeando el bid (venta con prisa)." },
  { codigo: "CNV", nombre: "Convicción", weight: 20, mira: "Tamaño del dinero",
    queHace: "Mide cuánto dinero de verdad entró y qué tan decidido — no es igual mucho volumen tímido que poco pero agresivo." },
  { codigo: "INU", nombre: "Inusualidad", weight: 20, mira: "Lo raro del día",
    queHace: "Compara la actividad de hoy con lo normal del ticker; lo raro suele avisar antes que el precio." },
  { codigo: "EST", nombre: "Estructura", weight: 15, mira: "Muros de gamma",
    queHace: "Lee dónde se amontonan los muros de gamma — dónde el precio tiende a frenar o a acelerar." },
  { codigo: "IV", nombre: "Contexto IV", weight: 10, mira: "Precio de la prima",
    queHace: "Dice si las opciones están caras o baratas frente a su historia (IV inflada = primas caras)." },
  { codigo: "PRE", nombre: "Confirmación de Precio", weight: 15, mira: "Qué hizo el precio",
    queHace: "Chequea si el precio confirma lo que dice el flujo, o lo absorbe sin moverse." },
  { codigo: "RSK", nombre: "Riesgo", weight: 0, mira: "Qué te puede salir mal",
    queHace: "Mira hacia qué lado resbala el precio, si hay gente negociando los contratos (para poder salir), cuánto se mueve con el mercado, hasta dónde puede caer en un día malo y qué tan confiable es la lectura." },
  { codigo: "CAT", nombre: "Catalizadores (Earnings)", weight: 0, mira: "Fechas que mueven",
    queHace: "Avisa si hay un reporte de resultados cerca — después la IV se desinfla y tu opción pierde valor aunque aciertes." },
  { codigo: "TCH", nombre: "Técnicos", weight: 0, mira: "Tendencia y momentum",
    queHace: "Lee para dónde va el precio en tres escalas (semanal, diario y por hora) y si coinciden, qué tan estirado está y cuánto se mueve en un día normal, y dice en qué precio se rompe esa lectura." },
  { codigo: "SNT", nombre: "Sentimiento", weight: 0, mira: "Lo que dicen las noticias",
    queHace: "Mira los titulares del ticker y quién los escribe (una agencia seria pesa más que un sitio de recomendaciones), avisa si ya están viejos, y suma qué opinan los analistas y si se están animando o enfriando." },
  { codigo: "FND", nombre: "Fundamentales", weight: 0, mira: "Si es buena empresa",
    queHace: "Mira si la empresa crece, si gana dinero, si debe mucho y si está cara o barata comparada con sus competidores — separando lo que la empresa reportó de lo que estiman los analistas." },
  { codigo: "GOV", nombre: "Gobernanza", weight: 0, mira: "La gente de adentro",
    queHace: "Mira si los directivos compran o venden acciones con su dinero, qué eventos serios reportó la empresa a la SEC y cuánto tiene apartado para demandas — cada cosa con su enlace a la SEC." },
  { codigo: "SUP", nombre: "Cadena de suministro", weight: 0, mira: "De quién depende",
    queHace: "Mira cuánto depende la empresa de sus clientes más grandes (según su reporte anual), si se le acumula mercancía más rápido de lo que vende y si reportó problemas de aranceles, exportación o escasez. El mapa real de proveedores no está en tu plan de datos, y lo dice." },
  { codigo: "MAC", nombre: "Macro", weight: 0, mira: "El ambiente del mercado",
    queHace: "Mide hacia dónde sopla el viento: el mercado, las tasas, el dólar y el oro en las últimas 20 sesiones; si el sector de la acción va mejor o peor que el mercado, y si la acción es de las fuertes o las flojas de su grupo — con la fecha de los datos." },
];

/**
 * Lo que FinAnalista tiene en "Pronto" y Nagimi NO va a fingir que tiene.
 * Se muestra igual, con el motivo — es más honesto que una tarjeta apagada.
 */
export const SIN_DATOS: { codigo: string; nombre: string; queHace: string; porQueNo: string }[] = [
];

/** Código de 3 letras + qué hace cada agente, por nombre del scorecard. */
const META: Record<string, { codigo: string; queHace: string }> = {
  "Agresividad": {
    codigo: "AGR",
    queHace: "Mira si el dinero grande entra pagando el ask (compra con prisa) o golpeando el bid (venta con prisa).",
  },
  "Convicción": {
    codigo: "CNV",
    queHace: "Mide cuánto dinero de verdad entró y qué tan decidido — no es igual mucho volumen tímido que poco pero agresivo.",
  },
  "Inusualidad": {
    codigo: "INU",
    queHace: "Compara la actividad de hoy con lo normal del ticker; lo raro suele avisar antes que el precio.",
  },
  "Estructura": {
    codigo: "EST",
    queHace: "Lee dónde se amontonan los muros de gamma — dónde el precio tiende a frenar o a acelerar.",
  },
  "Contexto IV": {
    codigo: "IV",
    queHace: "Dice si las opciones están caras o baratas frente a su historia (IV inflada = primas caras).",
  },
  "Confirmación de Precio": {
    codigo: "PRE",
    queHace: "Chequea si el precio confirma lo que dice el flujo, o lo absorbe sin moverse.",
  },
};

/** Umbrales (0-10): igual que el color del scorecard (≥6 verde, ≥4.5 medio). */
const UP = 6;
const DOWN = 4.5;

export function describeAgente(p: ParteAgente): AgenteDescrito {
  const meta = META[p.name] ?? { codigo: p.name.slice(0, 3).toUpperCase(), queHace: "" };
  const s = p.score;

  let senal: AgenteDescrito["senal"] = "Sin dato";
  let tono: AgenteDescrito["tono"] = "none";
  let empuje: string | null = null;

  if (s != null) {
    if (s >= UP) { senal = "Alcista"; tono = "up"; empuje = "Empuja la lectura hacia arriba."; }
    else if (s < DOWN) { senal = "Bajista"; tono = "down"; empuje = "Frena la lectura hacia abajo."; }
    else { senal = "Neutral"; tono = "neutral"; empuje = "No inclina la balanza — está en terreno medio."; }
  }

  return {
    codigo: meta.codigo,
    nombre: p.name,
    queHace: meta.queHace,
    viendo: p.note,
    score: s,
    weight: p.weight,
    senal,
    tono,
    empuje,
  };
}

/** Describe la mesa entera, en el orden dado. */
export function describeMesa(partes: ParteAgente[]): AgenteDescrito[] {
  return partes.map(describeAgente);
}

/**
 * El Gamma Skew como un agente más de la mesa (RSK, Riesgo). No es un puntaje
 * 0-10 como los otros — es una lectura de riesgo direccional, así que peso 0
 * (no cuenta para el puntaje compuesto). Encaja el skew ya calculado.
 */
export function skewComoAgente(input: {
  ladoEngrasado: "abajo" | "arriba" | "parejo";
  viendo: string;
  empuje: string | null;
}): AgenteDescrito {
  const { ladoEngrasado } = input;
  const senal = ladoEngrasado === "abajo" ? "Resbala ABAJO"
    : ladoEngrasado === "arriba" ? "Resbala ARRIBA"
    : "Parejo";
  const tono: AgenteDescrito["tono"] = ladoEngrasado === "abajo" ? "down"
    : ladoEngrasado === "arriba" ? "up"
    : "neutral";
  return {
    codigo: "RSK",
    nombre: "Riesgo",
    queHace: "Mira hacia qué lado se resbala el precio — para decidir si sigues en el trade o te sales.",
    viendo: input.viendo,
    score: null,
    weight: 0,
    senal,
    tono,
    empuje: input.empuje,
  };
}

/**
 * El Catalizador (earnings) como agente de la mesa (CAT). Peso 0: es contexto,
 * no un puntaje. Recibe el catalizador ya construido (fecha real de Finnhub).
 */
export function catalizadorComoAgente(input: {
  senal: string;
  viendo: string;
  aviso: string;
  tono: "up" | "down" | "neutral";
}): AgenteDescrito {
  return {
    codigo: "CAT",
    nombre: "Catalizadores (Earnings)",
    queHace: "Avisa si hay un reporte de resultados cerca — después la IV se desinfla y tu opción pierde valor aunque aciertes.",
    viendo: input.viendo,
    score: null,
    weight: 0,
    senal: input.senal,
    tono: input.tono,
    empuje: input.aviso,
  };
}
