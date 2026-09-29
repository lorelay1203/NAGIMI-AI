// 🛡️ RSK · Riesgo — el agente que responde "¿qué me puede salir mal aquí?".
//
// El ROL PLANEADO de Aetheris para este agente es:
//   · model factor exposures        → cuánto se mueve con el mercado (beta)
//   · add downside scenario checks  → hasta dónde puede caer en un día malo
//   · surface liquidity risks       → si hay gente negociando los contratos
//   · explain confidence limits     → qué tan confiable es esta lectura
// y Nagimi ya tenía la quinta pieza: hacia qué lado resbala el precio (gamma skew).
//
// Todo es puro y con pruebas; la ruta /api/riesgo junta los datos. Si una pieza
// no tiene datos se omite y se cuenta en la confianza — nunca se inventa.

import type { GammaSkew } from "./gammaSkew";

// ---------------------------------------------------------------------------
// 1) Liquidez de la cadena
// ---------------------------------------------------------------------------

export interface FilaCadena {
  strike: number;
  bid: number | null;
  ask: number | null;
  volume: number;
  oi: number;
}

export interface Liquidez {
  nivel: "buena" | "regular" | "mala";
  /** Diferencia típica entre lo que ofrecen y lo que piden, en % del precio medio. */
  spreadMedianoPct: number;
  /** Contratos abiertos cerca del precio. */
  contratosAbiertos: number;
  /** Contratos negociados hoy cerca del precio. */
  negociadosHoy: number;
  /** Cuántos contratos se miraron. */
  mirados: number;
}

/** Ventana alrededor del precio donde se mide la liquidez (±3%). */
const VENTANA_LIQ = 0.03;

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function liquidezCadena(filas: FilaCadena[], spot: number): Liquidez | null {
  if (!(spot > 0)) return null;
  const cerca = filas.filter((f) => Math.abs(f.strike - spot) / spot <= VENTANA_LIQ);
  const conPrecio = cerca.filter((f) => f.bid != null && f.ask != null && f.ask > 0 && f.bid >= 0 && f.ask >= f.bid);
  if (conPrecio.length === 0) return null;
  const spreads = conPrecio.map((f) => {
    const mid = (f.bid! + f.ask!) / 2;
    return mid > 0 ? ((f.ask! - f.bid!) / mid) * 100 : 100;
  });
  const spreadMedianoPct = mediana(spreads);
  const contratosAbiertos = cerca.reduce((s, f) => s + (f.oi || 0), 0);
  const negociadosHoy = cerca.reduce((s, f) => s + (f.volume || 0), 0);
  const nivel: Liquidez["nivel"] =
    spreadMedianoPct <= 3 && contratosAbiertos >= 5_000 ? "buena"
      : spreadMedianoPct > 10 || contratosAbiertos < 500 ? "mala"
        : "regular";
  return { nivel, spreadMedianoPct, contratosAbiertos, negociadosHoy, mirados: conPrecio.length };
}

// ---------------------------------------------------------------------------
// 2) Cuánto se mueve con el mercado (beta)
// ---------------------------------------------------------------------------

export interface Vela {
  time: string; // YYYY-MM-DD
  close: number;
}

export interface Beta {
  /** Si el mercado se mueve 1%, cuánto suele moverse el ticker, en %. */
  beta: number;
  /** Qué tanto se parece al mercado, 0-1. */
  parecido: number;
  /** Días usados. */
  dias: number;
}

/** Rendimientos diarios en las fechas que tienen las dos series. */
function rendimientosAlineados(a: Vela[], b: Vela[], max: number): [number[], number[]] {
  const mb = new Map(b.map((v) => [v.time, v.close]));
  const comunes = a.filter((v) => mb.has(v.time)).sort((x, y) => x.time.localeCompare(y.time));
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < comunes.length; i++) {
    const a0 = comunes[i - 1].close, a1 = comunes[i].close;
    const b0 = mb.get(comunes[i - 1].time)!, b1 = mb.get(comunes[i].time)!;
    if (a0 > 0 && b0 > 0) { ra.push(a1 / a0 - 1); rb.push(b1 / b0 - 1); }
  }
  return [ra.slice(-max), rb.slice(-max)];
}

/** Beta y parecido (correlación) del ticker contra el mercado, con los últimos `max` días. */
export function betaContra(ticker: Vela[], mercado: Vela[], max = 60): Beta | null {
  const [x, m] = rendimientosAlineados(ticker, mercado, max);
  if (x.length < 20) return null;
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const mm = m.reduce((s, v) => s + v, 0) / n;
  let cov = 0, vx = 0, vm = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (m[i] - mm);
    vx += (x[i] - mx) ** 2;
    vm += (m[i] - mm) ** 2;
  }
  if (!(vm > 0) || !(vx > 0)) return null;
  return { beta: cov / vm, parecido: cov / Math.sqrt(vx * vm), dias: n };
}

// ---------------------------------------------------------------------------
// 3) Escenario a la baja
// ---------------------------------------------------------------------------

export interface EscenarioBaja {
  /** Precio en un día malo normal (1 de cada 6 días: 1 desviación). */
  diaMalo: number;
  diaMaloPct: number;
  /** Precio en una semana mala normal. */
  semanaMala: number;
  semanaMalaPct: number;
  /** El primer suelo por debajo, si hay. */
  suelo: number | null;
  sueloPct: number | null;
  /** true si un día malo normal ya lo pondría por debajo del suelo. */
  rompeSuelo: boolean;
}

/** Movimiento de 1 desviación a la baja en `dias` de calendario, con la IV anual. */
function abajo(spot: number, iv: number, dias: number): number {
  return spot * Math.exp(-iv * Math.sqrt(dias / 365));
}

export function escenarioBaja(spot: number, iv: number | null, suelo: number | null): EscenarioBaja | null {
  if (!(spot > 0) || iv == null || !(iv > 0)) return null;
  const diaMalo = abajo(spot, iv, 1);
  const semanaMala = abajo(spot, iv, 7);
  const s = suelo != null && suelo > 0 && suelo < spot ? suelo : null;
  return {
    diaMalo, diaMaloPct: ((diaMalo - spot) / spot) * 100,
    semanaMala, semanaMalaPct: ((semanaMala - spot) / spot) * 100,
    suelo: s, sueloPct: s != null ? ((s - spot) / spot) * 100 : null,
    rompeSuelo: s != null && diaMalo < s,
  };
}

// ---------------------------------------------------------------------------
// 4) Límite de confianza
// ---------------------------------------------------------------------------

export interface Entrada {
  /** Qué dato es ("los muros", "la cadena de contratos"…). */
  que: string;
  ok: boolean;
  /** De dónde salió y qué tan atrasado viene, si se sabe. */
  nota?: string;
}

export interface Confianza {
  nivel: "alta" | "media" | "baja";
  faltan: string[];
  texto: string;
}

export function confianza(entradas: Entrada[]): Confianza {
  const ok = entradas.filter((e) => e.ok);
  const faltan = entradas.filter((e) => !e.ok).map((e) => e.que);
  const frac = entradas.length ? ok.length / entradas.length : 0;
  const nivel: Confianza["nivel"] = frac === 1 ? "alta" : frac >= 0.6 ? "media" : "baja";
  const notas = ok.filter((e) => e.nota).map((e) => `${e.que} de ${e.nota}`);
  const texto = (nivel === "alta"
    ? "Confianza alta: se pudieron leer todas las piezas."
    : `Confianza ${nivel}: faltó ${faltan.join(", ")}, así que esta lectura está incompleta.`)
    + (notas.length ? ` Fuentes: ${notas.join(" · ")}.` : "");
  return { nivel, faltan, texto };
}

// ---------------------------------------------------------------------------
// 5) La lectura completa
// ---------------------------------------------------------------------------

export interface LecturaRiesgo {
  senal: string;
  tono: "up" | "down" | "neutral";
  nivel: "alto" | "medio" | "bajo";
  viendo: string;
  empuje: string;
  /** Una línea por pieza, para mostrar debajo. */
  detalles: string[];
}

const usd = (n: number) => `$${n.toLocaleString("en-US", n >= 1000
  ? { maximumFractionDigits: 0 }
  : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const miles = (n: number) => Math.round(n).toLocaleString("en-US");

export function lecturaRiesgo(i: {
  ticker: string;
  skew: GammaSkew | null;
  liquidez: Liquidez | null;
  beta: Beta | null;
  /** Contra qué se midió la beta ("SPY"). */
  mercado: string;
  baja: EscenarioBaja | null;
  diaDeEmpujon: boolean | null;
  confianza: Confianza;
}): LecturaRiesgo {
  let puntos = 0;
  const detalles: string[] = [];

  if (i.skew) {
    if (i.skew.ladoEngrasado === "abajo") puntos += 1;
    detalles.push(i.skew.ladoEngrasado === "abajo"
      ? "Resbala hacia abajo: hay más dinero de opciones que acelera las caídas que las subidas."
      : i.skew.ladoEngrasado === "arriba"
        ? "Resbala hacia arriba: si sube, tiende a acelerar; las caídas se frenan más."
        : "No resbala a ningún lado en especial.");
  }

  if (i.diaDeEmpujon) {
    puntos += 1;
    detalles.push("Hoy es día de empujón: si se rompe un suelo, la caída puede estirarse en vez de frenar.");
  }

  if (i.liquidez) {
    const l = i.liquidez;
    puntos += l.nivel === "mala" ? 2 : l.nivel === "regular" ? 1 : 0;
    detalles.push(`Gente negociando los contratos: ${l.nivel}. Diferencia típica entre lo que ofrecen y lo que piden: ${l.spreadMedianoPct.toFixed(1)}%; `
      + `${miles(l.contratosAbiertos)} contratos abiertos cerca del precio. `
      + (l.nivel === "buena" ? "Entrar y salir es barato."
        : l.nivel === "regular" ? "Usa órdenes con precio límite, no a mercado."
          : "Salir puede costar caro o tardar: evita operar aquí o usa muy poco dinero."));
  }

  if (i.beta) {
    const b = i.beta;
    if (b.beta >= 1.5) puntos += 1;
    detalles.push(i.ticker === i.mercado
      ? `${i.ticker} es el mercado mismo.`
      : `Cuando ${i.mercado} se mueve 1%, ${i.ticker} suele moverse ${Math.abs(b.beta).toFixed(1)}%`
        + `${b.beta < 0 ? " en dirección contraria" : ""} (se parece al mercado en un ${Math.round(Math.abs(b.parecido) * 100)}%, últimos ${b.dias} días).`
        + (b.beta >= 1.5 ? " Un mal día del mercado le pega más fuerte." : b.beta < 0.7 ? " Se mueve más por su cuenta que por el mercado." : ""));
  }

  if (i.baja) {
    const e = i.baja;
    if (e.rompeSuelo) puntos += 1;
    detalles.push(`En un día malo normal (pasa 1 de cada 6 días) podría bajar a ${usd(e.diaMalo)} (${pct(e.diaMaloPct)}); `
      + `en una semana mala, a ${usd(e.semanaMala)} (${pct(e.semanaMalaPct)}).`
      + (e.suelo != null
        ? e.rompeSuelo
          ? ` Eso ya lo pondría debajo del suelo de ${usd(e.suelo)} (${pct(e.sueloPct!)}).`
          : ` El primer suelo está en ${usd(e.suelo)} (${pct(e.sueloPct!)}).`
        : " No hay un suelo de dinero claro por debajo."));
  }

  detalles.push(i.confianza.texto);

  const nivel: LecturaRiesgo["nivel"] = puntos >= 4 ? "alto" : puntos >= 2 ? "medio" : "bajo";
  const baja = i.confianza.nivel === "baja";

  const viendo = baja
    ? `Con pocos datos: ${detalles[0] ?? "no se pudo medir casi nada."}`
    : `Riesgo ${nivel}${i.skew?.ladoEngrasado === "abajo" ? ", resbala hacia abajo" : i.skew?.ladoEngrasado === "arriba" ? ", resbala hacia arriba" : ""}`
      + `${i.liquidez ? `, ${i.liquidez.nivel === "buena" ? "mucha" : i.liquidez.nivel === "regular" ? "poca" : "muy poca"} gente negociando los contratos` : ""}`
      + `${i.beta && i.ticker !== i.mercado ? `, se mueve ${Math.abs(i.beta.beta).toFixed(1)}× lo que el mercado` : ""}.`;

  const empuje = nivel === "alto"
    ? "Si entras, que sea con muy poco dinero y con la salida puesta desde el principio. Mejor todavía: una operación con pérdida máxima amarrada."
    : nivel === "medio"
      ? "Se puede operar, pero con tamaño chico y sabiendo dónde sales si falla."
      : "Nada fuera de lo normal: aplica tu regla de siempre (máximo 1% por operación).";

  return {
    senal: baja ? "Pocos datos" : `Riesgo ${nivel.toUpperCase()}`,
    tono: nivel === "alto" ? "down" : nivel === "medio" ? "neutral" : "up",
    nivel,
    viendo,
    empuje,
    detalles,
  };
}
