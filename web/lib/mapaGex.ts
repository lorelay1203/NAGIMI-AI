// 🗺️ Mapa GEX — la proyección de un ticker en tres escenarios.
//
// Es el formato que comparten en la comunidad ("PROYECCIÓN QQQ — GEX MAP"):
//   · un NIVEL CLAVE donde se decide el día,
//   · qué pasa si lo rompe hacia arriba (y hasta dónde),
//   · qué pasa si lo rechaza (y hasta dónde),
//   · qué pasa si se queda encerrado,
//   · el ambiente (bonos, dólar, miedo del mercado),
//   · y la regla: no perseguir, dejar que el dinero confirme.
//
// Todo sale de los muros de dinero de opciones (GEX) que Nagimi ya calcula.
// Nada se inventa: si falta un dato, esa parte se omite o se dice que falta.
// Puro y con pruebas; la pantalla solo lo pinta.

export interface BarraGex {
  strike: number;
  callGex: number;
  putGex: number;
}

export interface MapaInput {
  ticker: string;
  spot: number;
  regime: "positive" | "negative";
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  gammaFlip: number | null;
  maxPain: number | null;
  bars: BarraGex[];
  /** Parte del dinero agresivo que apuesta a que sube (0-1). null = no se pudo leer. */
  flujoAlcista: number | null;
  macro?: {
    /** Cambio % de 5 sesiones del fondo de bonos largos (TLT). Sube = tasas bajando. */
    bonos5d: number | null;
    /** Cambio % de 5 sesiones del dólar (UUP). */
    dolar5d: number | null;
    /** Nivel del VIX ("índice del miedo"). */
    vix: number | null;
    /** Cambio % de 5 sesiones del VIX. */
    vix5d: number | null;
  };
}

export interface Meta {
  /** Precio más bajo del grupo. */
  desde: number;
  /** Precio más alto del grupo (igual a `desde` si es uno solo). */
  hasta: number;
  /** Etiqueta extra, p. ej. "el precio que menos le duele a Wall Street". */
  nota?: string;
}

export interface Escenario {
  tipo: "alcista" | "bajista" | "rango";
  titulo: string;
  condicion: string;
  metas: Meta[];
  texto: string;
}

export interface MapaGex {
  ticker: string;
  spot: number;
  nivelClave: number;
  lectura: string;
  escenarios: Escenario[];
  ambiente: string | null;
  confirmaciones: string[];
  regla: string;
}

/** Fracción del muro más grande que cuenta como "muro de verdad". */
const UMBRAL_MURO = 0.3;
/** Ventana alrededor del precio donde se busca el nivel clave. */
const VENTANA_CLAVE = 0.015;

const px = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;

export function metaTexto(m: Meta): string {
  const base = m.desde === m.hasta ? px(m.desde) : `${px(m.desde)}–${px(m.hasta)}`;
  return m.nota ? `${base} (${m.nota})` : base;
}

/** Distancia típica entre precios pactados de la cadena. */
function paso(strikes: number[]): number {
  const s = [...new Set(strikes)].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < s.length; i++) min = Math.min(min, s[i] - s[i - 1]);
  return Number.isFinite(min) && min > 0 ? min : 1;
}

/**
 * El nivel donde se decide el día: el precio con más dinero de opciones
 * (sumando las dos apuestas) cerca del precio actual. La cercanía pesa: un muro
 * gigante al borde de la ventana no es "donde se decide hoy" si hay uno bueno
 * al lado del precio. El peso baja en línea recta de 1 (en el precio) a 0 (en
 * el borde de la ventana). Si la fuente no dio el perfil, el muro más cercano.
 */
export function nivelClave(i: MapaInput): number {
  const puntaje = (b: BarraGex) =>
    (b.callGex + b.putGex) * (1 - Math.abs(b.strike - i.spot) / i.spot / VENTANA_CLAVE);
  const cerca = i.bars.filter((b) => Math.abs(b.strike - i.spot) / i.spot < VENTANA_CLAVE && b.callGex + b.putGex > 0);
  if (cerca.length > 0) {
    return cerca.reduce((a, b) => (puntaje(b) > puntaje(a) ? b : a)).strike;
  }
  const cands = [i.callWall, i.putWall, i.magnet].filter((x): x is number => x != null && x > 0);
  if (cands.length === 0) return Math.round(i.spot);
  return cands.reduce((a, b) => (Math.abs(b - i.spot) < Math.abs(a - i.spot) ? b : a));
}

/**
 * Muros en una dirección, del más cercano al más lejano, juntando los que están
 * pegados en un rango ("$713–$714"). Máximo `max` grupos.
 */
export function murosEnDireccion(
  bars: BarraGex[], desde: number, dir: "arriba" | "abajo", max = 3,
): Meta[] {
  const lado = dir === "arriba"
    ? bars.filter((b) => b.strike > desde).map((b) => ({ k: b.strike, g: b.callGex }))
    : bars.filter((b) => b.strike < desde).map((b) => ({ k: b.strike, g: b.putGex }));
  if (lado.length === 0) return [];
  const tope = Math.max(...lado.map((x) => x.g));
  if (!(tope > 0)) return [];
  const p = paso(bars.map((b) => b.strike));
  const fuertes = lado
    .filter((x) => x.g >= tope * UMBRAL_MURO)
    .map((x) => x.k)
    .sort((a, b) => (dir === "arriba" ? a - b : b - a));

  const grupos: Meta[] = [];
  for (const k of fuertes) {
    const ult = grupos[grupos.length - 1];
    const borde = ult ? (dir === "arriba" ? ult.hasta : ult.desde) : null;
    if (ult && borde != null && Math.abs(k - borde) <= p * 1.5) {
      if (dir === "arriba") ult.hasta = k; else ult.desde = k;
    } else {
      if (grupos.length >= max) break;
      grupos.push({ desde: k, hasta: k });
    }
  }
  return grupos;
}

function textoFlujo(f: number | null): string {
  if (f == null) return "No se pudo leer hacia dónde está entrando el dinero hoy.";
  const pct = Math.round(f * 100);
  if (f >= 0.58) return `El dinero se inclina a que sube (${pct}% de lo que entra con prisa).`;
  if (f <= 0.42) return `El dinero se inclina a que baja (${100 - pct}% de lo que entra con prisa).`;
  return `El dinero está repartido (${pct}% apuesta a que sube): ningún lado manda todavía.`;
}

export function textoAmbiente(m: MapaInput["macro"]): string | null {
  if (!m) return null;
  const partes: string[] = [];
  if (m.bonos5d != null) {
    partes.push(m.bonos5d > 0.3
      ? "las tasas de interés están bajando (los bonos largos suben)"
      : m.bonos5d < -0.3
        ? "las tasas de interés están subiendo (los bonos largos bajan)"
        : "las tasas de interés están quietas");
  }
  if (m.vix != null) {
    const nivel = m.vix < 16 ? "bajo" : m.vix < 22 ? "normal" : "alto";
    const va = m.vix5d == null ? "" : m.vix5d < -3 ? " y bajando" : m.vix5d > 3 ? " y subiendo" : "";
    partes.push(`el miedo del mercado (VIX) está ${nivel}, en ${m.vix.toFixed(1)}${va}`);
  }
  if (m.dolar5d != null) {
    partes.push(Math.abs(m.dolar5d) < 0.5 ? "el dólar está contenido"
      : m.dolar5d > 0 ? "el dólar se está fortaleciendo" : "el dólar se está debilitando");
  }
  if (partes.length === 0) return null;

  // ¿El ambiente ayuda o estorba a las acciones?
  let favor = 0;
  if (m.bonos5d != null) favor += m.bonos5d > 0.3 ? 1 : m.bonos5d < -0.3 ? -1 : 0;
  if (m.vix5d != null) favor += m.vix5d < -3 ? 1 : m.vix5d > 3 ? -1 : 0;
  if (m.dolar5d != null) favor += m.dolar5d < -0.5 ? 1 : m.dolar5d > 0.5 ? -1 : 0;
  const cierre = favor > 0
    ? "Eso le quita presión a las acciones, pero por sí solo no confirma una subida."
    : favor < 0
      ? "Eso le pone presión a las acciones: cualquier subida tiene más trabajo."
      : "El ambiente no empuja claramente para ningún lado.";

  const lista = partes.length === 1 ? partes[0]
    : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `${lista[0].toUpperCase()}${lista.slice(1)}. ${cierre}`;
}

export function mapaGex(i: MapaInput): MapaGex {
  const K = nivelClave(i);
  const rango = i.regime === "positive";
  const arribaDeK = i.spot >= K;

  const techos = murosEnDireccion(i.bars, Math.max(K, i.spot), "arriba");
  if (techos.length === 0 && i.callWall != null && i.callWall > Math.max(K, i.spot)) {
    techos.push({ desde: i.callWall, hasta: i.callWall });
  }
  const suelos = murosEnDireccion(i.bars, Math.min(K, i.spot), "abajo");
  if (suelos.length === 0 && i.putWall != null && i.putWall < Math.min(K, i.spot)) {
    suelos.push({ desde: i.putWall, hasta: i.putWall });
  }
  // El max pain entra primero en la lista de bajada si está debajo y antes del
  // primer suelo: es donde el precio suele gravitar al cierre.
  if (i.maxPain != null && i.maxPain < Math.min(K, i.spot)) {
    const primero = suelos[0];
    const yaEsta = suelos.some((s) => i.maxPain! >= s.desde && i.maxPain! <= s.hasta);
    if (!yaEsta && (!primero || i.maxPain > primero.hasta)) {
      suelos.unshift({ desde: i.maxPain, hasta: i.maxPain, nota: "el precio que menos le duele a Wall Street" });
      if (suelos.length > 3) suelos.pop();
    } else if (yaEsta) {
      const s = suelos.find((x) => i.maxPain! >= x.desde && i.maxPain! <= x.hasta)!;
      s.nota = "ahí está el precio que menos le duele a Wall Street";
    }
  }

  const dist = ((K - i.spot) / i.spot) * 100;
  const donde = Math.abs(dist) < 0.1
    ? `justo encima del nivel clave de ${px(K)}`
    : `a ${Math.abs(dist).toFixed(1)}% ${dist > 0 ? "debajo" : "encima"} del nivel clave de ${px(K)}`;

  const lectura = `${i.ticker} está en ${px(i.spot)}, ${donde}: es el precio con más dinero de opciones apilado cerca de donde está ahora. `
    + (rango
      ? "Hoy es día de rango: los que vendieron los contratos frenan los movimientos, así que el precio tiende a devolverse en los muros mientras no entre suficiente dinero para romperlos. "
      : "Hoy es día de empujón: los que vendieron los contratos persiguen el precio, así que si rompe un muro tiende a estirarse en vez de frenar. ")
    + textoFlujo(i.flujoAlcista);

  const metasTxt = (ms: Meta[]) => ms.map(metaTexto);
  const unir = (xs: string[], cola: string) => xs.length <= 1 ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", después ")} y, ${cola}, ${xs[xs.length - 1]}`;

  const alcista: Escenario = {
    tipo: "alcista",
    titulo: "Si sube",
    condicion: arribaDeK
      ? `que se sostenga arriba de ${px(K)} y el dinero siga comprando`
      : `que rompa y se sostenga arriba de ${px(K)} con el dinero comprando`,
    metas: techos,
    texto: techos.length
      ? `Si ${i.ticker} ${arribaDeK ? "se sostiene" : "rompe y se sostiene"} arriba de ${px(K)} y el dinero que entra con prisa sigue inclinado a que sube, las metas serían ${unir(metasTxt(techos), "si sigue entrando dinero comprador")}.`
      : `Si ${i.ticker} ${arribaDeK ? "se sostiene" : "rompe"} arriba de ${px(K)}, no hay otro muro de dinero cerca por encima: el camino queda abierto, pero sin meta clara.`,
  };

  const bajista: Escenario = {
    tipo: "bajista",
    titulo: "Si baja",
    condicion: arribaDeK
      ? `que pierda ${px(K)} con el dinero vendiendo`
      : `que choque con ${px(K)}, lo rechace y el dinero se ponga a vender`,
    metas: suelos,
    texto: suelos.length
      ? `Si ${i.ticker} ${arribaDeK ? `pierde ${px(K)}` : `llega a ${px(K)} y lo rechaza`} mientras el dinero se pone a vender, miraría ${unir(metasTxt(suelos), "si sigue la presión vendedora")}.`
      : `Si ${i.ticker} ${arribaDeK ? `pierde ${px(K)}` : `rechaza ${px(K)}`}, no hay un suelo de dinero claro por debajo: la caída no tendría freno marcado.`,
  };

  const bordeAbajo = arribaDeK ? K : (suelos[0]?.hasta ?? null);
  const bordeArriba = arribaDeK ? (techos[0]?.desde ?? null) : K;
  const repartido = i.flujoAlcista == null || (i.flujoAlcista > 0.42 && i.flujoAlcista < 0.58);
  const rangoEsc: Escenario = {
    tipo: "rango",
    titulo: "Si se queda encerrado",
    condicion: bordeAbajo != null && bordeArriba != null
      ? `que se quede entre ${px(bordeAbajo)} y ${px(bordeArriba)}`
      : "que no rompa ningún muro",
    metas: bordeAbajo != null && bordeArriba != null ? [{ desde: bordeAbajo, hasta: bordeArriba }] : [],
    texto: (bordeAbajo != null && bordeArriba != null
      ? `También puede quedarse atrapado entre ${px(bordeAbajo)} y ${px(bordeArriba)}. `
      : "También puede quedarse sin romper nada. ")
      + (rango && repartido
        ? "Con día de rango y el dinero sin dueño claro, este escenario es muy posible."
        : rango
          ? "Es día de rango, así que es posible, aunque el dinero ya se está inclinando para un lado."
          : "Con día de empujón es menos probable: si arranca, tiende a salirse del rango."),
  };

  const confirmaciones: string[] = [];
  if (techos.length) {
    confirmaciones.push(`Arriba de ${px(K)} + dinero comprando con prisa → buscar ${metasTxt(techos.slice(0, 2)).join(" y luego ")}.`);
  }
  if (suelos.length) {
    confirmaciones.push(`${arribaDeK ? `Pierde ${px(K)}` : `Rechazo en ${px(K)}`} + dinero vendiendo → mirar ${metasTxt(suelos.slice(0, 2)).join(" y luego ")}.`);
  }
  if (i.gammaFlip != null && Math.abs(i.gammaFlip - i.spot) / i.spot < 0.02) {
    confirmaciones.push(`Si cruza ${px(Math.round(i.gammaFlip))} cambia el tipo de día (de ${rango ? "rango a empujón" : "empujón a rango"}): revisar el plan.`);
  }

  return {
    ticker: i.ticker,
    spot: i.spot,
    nivelClave: K,
    lectura,
    escenarios: [alcista, bajista, rangoEsc],
    ambiente: textoAmbiente(i.macro),
    confirmaciones,
    regla: "No perseguir el precio ni adelantarse a la ruptura. Dejar que el dinero confirme cuál de los tres escenarios se está activando, y entonces entrar.",
  };
}
