// ============================================================================
// Reglas de oro: un chequeo en palabras simples que se corre sobre el contrato
// del ticket — ¿vale la pena tomarlo?
//
//   · Delta   → delta < 0.25 se descarta; 0.50-0.60 bueno; 0.70+ excelente.
//     Excepción: en 0DTE, un poco fuera del dinero para agarrar el empujón de
//     la gamma cuando entra en el dinero.
//   · Theta   → si el tiempo se come más del 5% del contrato por día, no
//     entres; 1-2% está bien. El tiempo no puede ir más rápido que el dinero.
//   · IV      → IV sana 24-48%; 70-80% cuidado; 90%+ catastrófico (sobre todo
//     antes de earnings).
//   · GEX     → no operar con el GEX total cerca de
//     cero (±2B en SPX), mejor 3-4B+ (20B hermoso); no operar el zigzag; no la
//     primera hora; strike 10-30 puntos ANTES de la meta, nunca en la meta;
//     salir unos puntos antes; si el imán es igual al muro, salir ahí; si el
//     precio pasó el muro y el muro no se mueve, espera que regrese al muro.
//
// Todo es PURO (sin red) para poder probarlo. Lo que no se puede medir se
// marca "sin dato", nunca como "todo bien".
// ============================================================================

export type EstadoRegla = "ok" | "ojo" | "no" | "sin_dato";

export interface ReglaOro {
  id: "hora" | "gex_total" | "flip" | "zigzag" | "indice" | "delta" | "theta" | "iv" | "strike" | "salida" | "iman_muro" | "extremo"
    | "regimen" | "prima_iv" | "spread" | "tarde";
  nombre: string;
  estado: EstadoRegla;
  texto: string;
}

/** Lo que hace falta saber del DÍA (muros, hora), sin importar la estrategia. */
export interface EntradaDia {
  ticker: string;
  /** Si los muros vienen del índice (SPX para SPY, NDX para QQQ), cuál. */
  espejoDe?: string | null;
  spot: number;
  /** Fuente de los muros: solo con MarketSnack el GEX total viene en dólares comparables a las medidas de fuerza (2B, 3B, 20B). */
  fuenteGex: string;
  netGex: number | null;
  gammaFlip: number | null;
  magnet: number | null;
  callWall: number | null;
  putWall: number | null;
  /** Perfil por strike (puede venir vacío). */
  bars: { strike: number; netGex: number }[];
  ahora: Date;
}

/** Para COMPRAR un contrato (el Ticket). */
export interface EntradaReglas extends EntradaDia {
  /** Hacia dónde va la idea y su meta en el precio de la acción. */
  direccion: "long" | "short";
  meta: number;
  /** El contrato elegido (null si todavía no hay). */
  contrato: {
    strike: number;
    type: "call" | "put";
    mid: number;
    delta: number;          // |delta|
    theta: number | null;   // por acción, negativo
    iv: number | null;      // decimal (0.25 = 25%)
    dte: number;            // días para vencer (0 = hoy)
  } | null;
}

/** Para VENDER prima con un spread de crédito. */
export interface EntradaPrima extends EntradaDia {
  regimen: "positive" | "negative";
  /** IV de los contratos al dinero (decimal). Alta = la prima viene gorda. */
  ivAtm: number | null;
  /** El spread que se propone (el mejor que cabe), o null. */
  spread: {
    lado: "call" | "put";
    vender: number;
    comprar: number;
    popPct: number | null;
    esperanza: number | null;
    trasElMuro: boolean;
  } | null;
}

export interface ResultadoReglas {
  reglas: ReglaOro[];
  veredicto: "verde" | "amarillo" | "rojo";
  resumen: string;
}

const B = 1e9;
const esSpx = (t: string) => /^\^?SPXW?$/i.test(t.trim());
const esNdx = (t: string) => /^\^?NDX$/i.test(t.trim());
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Minutos desde la medianoche en Nueva York. */
export function minutosNY(d: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * Cuántas veces cambia de signo el GEX en los strikes que importan cerca del
 * precio. Se ignoran las barras chiquitas (menos del 10% de la más grande):
 * ruido, no zigzag.
 */
export function cambiosDeSigno(bars: { strike: number; netGex: number }[], spot: number, cuantas = 8): number {
  const cerca = [...bars]
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, cuantas);
  const max = Math.max(0, ...cerca.map((b) => Math.abs(b.netGex)));
  if (!(max > 0)) return 0;
  const fuertes = cerca.filter((b) => Math.abs(b.netGex) >= max * 0.1).sort((a, b) => a.strike - b.strike);
  let cambios = 0;
  for (let i = 1; i < fuertes.length; i++) {
    if (Math.sign(fuertes[i].netGex) !== Math.sign(fuertes[i - 1].netGex)) cambios++;
  }
  return cambios;
}

/** Dónde tomar la ganancia: unos puntos ANTES de la meta (≈0.06% del precio). */
export function salidaAntes(meta: number, spot: number, direccion: "long" | "short"): number {
  const colchon = Math.max(spot * 0.0006, 0.05);
  const x = direccion === "long" ? meta - colchon : meta + colchon;
  return Math.round(x * 100) / 100;
}

/**
 * Las reglas del DÍA que valen para cualquier estrategia: la hora, de dónde
 * salen los muros, su fuerza, el punto de cambio, el zigzag, el imán pegado a
 * un muro y el precio pasado de un muro.
 */
function reglasDelDia(e: EntradaDia, venceHoy: boolean): ReglaOro[] {
  const reglas: ReglaOro[] = [];
  // De dónde salen los muros: el índice (si vienen "en espejo") o el propio ticker.
  const base = e.espejoDe ?? e.ticker;
  const spx = esSpx(base);

  // 1) La hora: la primera hora los muros todavía se están acomodando.
  const min = minutosNY(e.ahora);
  if (min < 570 || min >= 960) {
    reglas.push({ id: "hora", nombre: "Hora", estado: "ojo", texto: "El mercado está cerrado: los muros de ahora son de la última foto. Revísalo cuando abra." });
  } else if (min < 630) {
    reglas.push({ id: "hora", nombre: "Hora", estado: "ojo", texto: "Primera hora (9:30-10:30 AM NY): no se opera el GEX todavía — los muros se están acomodando. Espera a las 10:30." });
  } else if (min >= 930 && venceHoy) {
    reglas.push({ id: "hora", nombre: "Hora", estado: "ojo", texto: "Última media hora con un contrato que se acaba hoy: el tiempo corre en contra muy rápido." });
  } else {
    reglas.push({ id: "hora", nombre: "Hora", estado: "ok", texto: "Buena hora para operar los muros (después de las 10:30 AM)." });
  }

  // 2) ¿De dónde salen los muros? Funcionan mejor en índices que se liquidan en efectivo.
  if (e.espejoDe && (spx || esNdx(base))) {
    reglas.push({ id: "indice", nombre: "Dónde se usa", estado: "ok", texto: `Muros del ${base} (se liquida en efectivo) pasados a precios de ${e.ticker}: la misma idea, más barata.` });
  } else if (spx || esNdx(base)) {
    reglas.push({ id: "indice", nombre: "Dónde se usa", estado: "ok", texto: `${base}: índice que se liquida en efectivo, donde los muros funcionan mejor.` });
  } else {
    reglas.push({ id: "indice", nombre: "Dónde se usa", estado: "ojo", texto: `Los muros funcionan mejor en SPX. En ${e.ticker} sirven de guía, pero respétalos menos y confirma con el flujo.` });
  }

  // 3) Tamaño del GEX total (solo comparable en SPX con datos de MarketSnack).
  if (spx && e.fuenteGex === "marketsnack" && e.netGex != null) {
    const a = Math.abs(e.netGex);
    const txt = `GEX total ${e.netGex < 0 ? "−" : ""}$${(a / B).toFixed(1)}B.`;
    if (a < 2 * B) reglas.push({ id: "gex_total", nombre: "Fuerza del GEX", estado: "no", texto: `${txt} Está casi en cero: así no se opera (menos de 2B no da una dirección clara).` });
    else if (a < 3 * B) reglas.push({ id: "gex_total", nombre: "Fuerza del GEX", estado: "ojo", texto: `${txt} Flojito: lo bueno es 3-4B o más.` });
    else reglas.push({ id: "gex_total", nombre: "Fuerza del GEX", estado: "ok", texto: `${txt} ${a >= 20 * B ? "¡Un día \"hermoso\" para el GEX!" : "Suficiente fuerza (3B o más)."}` });
  } else {
    reglas.push({ id: "gex_total", nombre: "Fuerza del GEX", estado: "sin_dato", texto: "Las medidas de fuerza (2B, 3B, 20B) son para SPX con datos de MarketSnack; aquí no se pueden comparar." });
  }

  // 4) Cerca del gamma flip el GEX vale casi cero → no hay dirección clara.
  if (e.gammaFlip != null && e.gammaFlip > 0 && e.spot > 0) {
    const dist = Math.abs(e.spot - e.gammaFlip) / e.spot;
    reglas.push(dist < 0.0025
      ? { id: "flip", nombre: "Punto de cambio", estado: "no", texto: `El precio está pegado al punto de cambio (${fmt(e.gammaFlip)}): ahí el GEX es casi cero y puede ir para cualquier lado.` }
      : { id: "flip", nombre: "Punto de cambio", estado: "ok", texto: `Lejos del punto de cambio (${fmt(e.gammaFlip)}): la lectura del día es clara.` });
  } else {
    reglas.push({ id: "flip", nombre: "Punto de cambio", estado: "sin_dato", texto: "No se sabe dónde está el punto de cambio hoy." });
  }

  // 5) Zigzag: positivo, negativo, positivo… = no hay visión clara.
  if (e.bars.length >= 4) {
    const c = cambiosDeSigno(e.bars, e.spot);
    reglas.push(c >= 4
      ? { id: "zigzag", nombre: "Zigzag", estado: "no", texto: "Los muros cerca del precio van en zigzag (+ − + −): eso no se opera, no hay visión clara." }
      : c === 3
        ? { id: "zigzag", nombre: "Zigzag", estado: "ojo", texto: "Los muros cerca del precio cambian de lado varias veces: lectura algo confusa." }
        : { id: "zigzag", nombre: "Zigzag", estado: "ok", texto: "Los muros cerca del precio están ordenados (sin zigzag)." });
  } else {
    reglas.push({ id: "zigzag", nombre: "Zigzag", estado: "sin_dato", texto: "No hay el dibujo por strike para revisar si hay zigzag." });
  }

  // 6) Imán pegado a un muro → ahí puede rebotar: se toma la ganancia ahí.
  const pegado = (x: number | null) => x != null && e.magnet != null && Math.abs(x - e.magnet) <= e.spot * 0.001;
  if (e.magnet != null && (pegado(e.callWall) || pegado(e.putWall))) {
    reglas.push({ id: "iman_muro", nombre: "Imán = muro", estado: "ojo", texto: `El imán (${fmt(e.magnet)}) está en el mismo sitio que un muro: toma la ganancia AHÍ, porque puede rebotar.` });
  }

  // 7) Nivel extremo: el precio pasó el muro.
  if (e.callWall != null && e.spot > e.callWall) {
    reglas.push({ id: "extremo", nombre: "Pasó el muro", estado: "ojo", texto: `El precio pasó el muro de arriba (${fmt(e.callWall)}). Si el muro NO se mueve hacia arriba en los próximos minutos, lo normal es que regrese al muro (idea de bajada).` });
  } else if (e.putWall != null && e.spot < e.putWall) {
    reglas.push({ id: "extremo", nombre: "Pasó el muro", estado: "ojo", texto: `El precio rompió el muro de abajo (${fmt(e.putWall)}). Si el muro NO se mueve hacia abajo, lo normal es que regrese al muro (idea de subida).` });
  }

  return reglas;
}

/** Semáforo: un "no" pone rojo; tres o más "ojo", amarillo. */
function semaforo(reglas: ReglaOro[], textoVerde: string): ResultadoReglas {
  const nos = reglas.filter((r) => r.estado === "no");
  const ojos = reglas.filter((r) => r.estado === "ojo");
  const veredicto: ResultadoReglas["veredicto"] = nos.length > 0 ? "rojo" : ojos.length >= 3 ? "amarillo" : "verde";
  const resumen = veredicto === "rojo"
    ? `No pasa las reglas de oro: ${nos.map((r) => r.nombre.toLowerCase()).join(", ")}.`
    : veredicto === "amarillo"
      ? `Pasa, pero con varias señales de cuidado (${ojos.length}). Entra con poco o espera.`
      : textoVerde;
  return { reglas, veredicto, resumen };
}

export function revisarReglasOro(e: EntradaReglas): ResultadoReglas {
  const reglas = reglasDelDia(e, e.contrato?.dte === 0);

  // 8-12) El contrato.
  const k = e.contrato;
  if (k) {
    const entreSpotYMeta = k.type === "call"
      ? k.strike > e.spot && k.strike < e.meta
      : k.strike < e.spot && k.strike > e.meta;

    // Delta
    if (k.delta < 0.25) {
      reglas.push({ id: "delta", nombre: "Delta", estado: "no", texto: `Delta ${k.delta.toFixed(2)}: menos de 0.25 se descarta — barato, pero casi siempre se pierde.` });
    } else if (k.delta < 0.5) {
      if (k.dte === 0 && entreSpotYMeta) {
        reglas.push({ id: "delta", nombre: "Delta", estado: "ok", texto: `Delta ${k.delta.toFixed(2)}: es la excepción para 0DTE — un poco fuera del dinero para agarrar el empujón cuando cruza el strike.` });
      } else if (k.dte > 90 && k.delta >= 0.3) {
        reglas.push({ id: "delta", nombre: "Delta", estado: "ojo", texto: `Delta ${k.delta.toFixed(2)}: "promedio" — pasa solo porque vence en más de 90 días.` });
      } else {
        reglas.push({ id: "delta", nombre: "Delta", estado: "ojo", texto: `Delta ${k.delta.toFixed(2)}: flojita. Lo ideal es 0.50-0.60 (bueno) o 0.70+ (excelente).` });
      }
    } else if (k.delta < 0.7) {
      reglas.push({ id: "delta", nombre: "Delta", estado: "ok", texto: `Delta ${k.delta.toFixed(2)}: "bueno" (0.50-0.60).` });
    } else {
      reglas.push({ id: "delta", nombre: "Delta", estado: "ok", texto: `Delta ${k.delta.toFixed(2)}: "excelente" — se mueve casi como la acción.` });
    }

    // Theta
    if (k.dte === 0) {
      reglas.push({ id: "theta", nombre: "Theta (el tiempo)", estado: "ojo", texto: "Se acaba hoy: el tiempo se lo come en horas. Solo sirve si el movimiento llega rápido — si se estanca, sal." });
    } else if (k.theta != null && k.mid > 0) {
      const pct = (Math.abs(k.theta) / k.mid) * 100;
      const txt = `El tiempo le quita ${pct.toFixed(1)}% al día.`;
      reglas.push(pct > 5
        ? { id: "theta", nombre: "Theta (el tiempo)", estado: "no", texto: `${txt} Más de 5%: no entres — el tiempo no puede ir más rápido que el dinero.` }
        : pct > 2
          ? { id: "theta", nombre: "Theta (el tiempo)", estado: "ojo", texto: `${txt} Entre 2% y 5%: aceptable pero caro en tiempo.` }
          : { id: "theta", nombre: "Theta (el tiempo)", estado: "ok", texto: `${txt} 2% o menos: bien.` });
    } else {
      reglas.push({ id: "theta", nombre: "Theta (el tiempo)", estado: "sin_dato", texto: "La fuente no trajo la theta de este contrato." });
    }

    // IV
    if (k.iv != null && k.iv > 0) {
      const iv = k.iv < 5 ? k.iv * 100 : k.iv;
      const txt = `Nerviosismo (IV) ${Math.round(iv)}%.`;
      reglas.push(iv > 90
        ? { id: "iv", nombre: "IV", estado: "no", texto: `${txt} Más de 90% es "catastrófico" para comprar: pagas de más y el IV crush te lo quita aunque aciertes.` }
        : iv > 70
          ? { id: "iv", nombre: "IV", estado: "ojo", texto: `${txt} Muy caro (70%+): mejor vender prima o hacer un spread que comprar suelto.` }
          : iv > 48
            ? { id: "iv", nombre: "IV", estado: "ojo", texto: `${txt} Algo caro (lo sano es 24-48%).` }
            : { id: "iv", nombre: "IV", estado: "ok", texto: `${txt} Sano (24-48%).` });
    } else {
      reglas.push({ id: "iv", nombre: "IV", estado: "sin_dato", texto: "La fuente no trajo la IV de este contrato." });
    }

    // Strike frente a la meta: nunca en la meta, mejor antes.
    const pasaMeta = k.type === "call" ? k.strike >= e.meta : k.strike <= e.meta;
    const colchon = e.spot * 0.001; // ~7 puntos en SPX a 7,000
    const muyPegado = Math.abs(e.meta - k.strike) < colchon;
    if (pasaMeta) {
      reglas.push({ id: "strike", nombre: "Strike vs. meta", estado: "no", texto: `El strike ${fmt(k.strike)} está en la meta (${fmt(e.meta)}) o más allá: aunque el precio llegue, el contrato no entra en el dinero. Escógelo 10-30 puntos ANTES de la meta.` });
    } else if (muyPegado) {
      reglas.push({ id: "strike", nombre: "Strike vs. meta", estado: "ojo", texto: `El strike ${fmt(k.strike)} está casi en la meta (${fmt(e.meta)}): apenas entra en el dinero. Uno un poco más cerca del precio rinde mejor.` });
    } else {
      reglas.push({ id: "strike", nombre: "Strike vs. meta", estado: "ok", texto: `El strike ${fmt(k.strike)} queda antes de la meta (${fmt(e.meta)}): si el precio llega, el contrato entra en el dinero y acelera.` });
    }
  }

  // Salida: siempre se dice dónde.
  const sal = salidaAntes(e.meta, e.spot, e.direccion);
  reglas.push({ id: "salida", nombre: "Dónde salir", estado: "ok", texto: `No esperes el número exacto: toma la ganancia cerca de ${fmt(sal)} (la meta es ${fmt(e.meta)}; ahí suele rebotar).` });

  return semaforo(reglas, k ? "Cumple las reglas de oro." : "Los muros pasan las reglas de oro (el contrato todavía no se pudo revisar).");
}

/**
 * Reglas de oro para VENDER prima: las mismas del día, más las que importan
 * al cobrar por el tiempo — que el día sea de rango (los muros frenan), que la
 * prima venga gorda, vender MÁS ALLÁ del muro y salir si el precio toca el muro.
 */
export function revisarReglasPrima(e: EntradaPrima): ResultadoReglas {
  const reglas = reglasDelDia(e, true);

  // Tarde: la prima de 0DTE ya se derritió.
  const min = minutosNY(e.ahora);
  if (min >= 900 && min < 960) {
    reglas.push({ id: "tarde", nombre: "Tarde", estado: "ojo", texto: "Después de las 3:00 PM la prima de hoy ya casi se derritió: cobras muy poco por el mismo riesgo." });
  }

  // El tipo de día manda: vender prima necesita que los muros frenen.
  reglas.push(e.regimen === "positive"
    ? { id: "regimen", nombre: "Tipo de día", estado: "ok", texto: "Día de rango (gamma positiva): los muros frenan el precio — es el día bueno para vender prima." }
    : { id: "regimen", nombre: "Tipo de día", estado: "no", texto: "Día de empujón (gamma negativa): los movimientos se aceleran y rompen muros. Vender prima hoy es nadar contra la corriente." });

  // La prima: al revés que al comprar, aquí la IV alta ayuda (cobras más).
  if (e.ivAtm != null && e.ivAtm > 0) {
    const iv = e.ivAtm < 5 ? e.ivAtm * 100 : e.ivAtm;
    const txt = `Nerviosismo (IV) ${Math.round(iv)}%.`;
    reglas.push(iv >= 48
      ? { id: "prima_iv", nombre: "Prima", estado: "ok", texto: `${txt} Prima gorda: es cuando conviene VENDER (lo contrario de comprar).` }
      : iv >= 15
        ? { id: "prima_iv", nombre: "Prima", estado: "ok", texto: `${txt} Prima normal.` }
        : { id: "prima_iv", nombre: "Prima", estado: "ojo", texto: `${txt} Prima flaca: cobras poco por lo que arriesgas.` });
  } else {
    reglas.push({ id: "prima_iv", nombre: "Prima", estado: "sin_dato", texto: "La fuente no trajo la IV de hoy." });
  }

  const sp = e.spread;
  if (sp) {
    const lado = sp.lado === "call" ? "calls" : "puts";
    reglas.push(sp.trasElMuro
      ? { id: "spread", nombre: "Dónde vendes", estado: "ok", texto: `Vendes ${lado} en ${fmt(sp.vender)}, más allá del muro: el precio tendría que romperlo para hacerte daño.` }
      : { id: "spread", nombre: "Dónde vendes", estado: "no", texto: `Vendes ${lado} en ${fmt(sp.vender)}, DENTRO del rango: es apostar a que el precio no llegue a donde suele ir.` });
    if (sp.esperanza != null && sp.esperanza < 0) {
      reglas.push({ id: "spread", nombre: "A la larga", estado: "ojo", texto: `Gana muchas veces (≈${Math.round(sp.popPct ?? 0)}%) pero a la larga pierde: cuando falla, quita más de lo que suma.` });
    }
    const muro0 = sp.lado === "call" ? e.callWall : e.putWall;
    // El muro solo sirve de alarma si está entre el precio y tu strike.
    const muro = muro0 != null && (sp.lado === "call" ? muro0 > e.spot : muro0 < e.spot) ? muro0 : null;
    reglas.push({ id: "salida", nombre: "Dónde salir", estado: "ok", texto: muro != null
      ? `Si el precio toca el muro de ${sp.lado === "call" ? "arriba" : "abajo"} (${fmt(muro)}), cierra: no esperes a que llegue a tu strike (${fmt(sp.vender)}).`
      : `Si el precio se acerca a tu strike (${fmt(sp.vender)}), cierra antes de que llegue.` });
  }

  return semaforo(reglas, sp ? "Cumple las reglas de oro para vender prima." : "El día pasa las reglas de oro para vender prima (todavía no hay spread que revisar).");
}
