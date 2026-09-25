// 🎟️ El ticket en texto — mismo orden que el "GEX Ticket" del Agente 0DTE,
// pero en palabras que se entienden.
//
// El original dice:
//   BUY SPX 7710 C @ $6.70 (bid 6.60 / ask 6.80)
//   target $27.98 (idx 7735 · +318%)
//   stop $2.79 (idx 7665 · −58%) · R:B 5.4
//   Δ 0.42 · Γ 0.016 · IV 12% · cost $670 · risk $391/ct
//   ⚠ target/R:B inflado por gamma 0DTE — optimista
//
// Aquí cada línea dice lo mismo sin siglas, y se añade lo que el original no
// dice: si cabe en TU cuenta con tu regla de riesgo. Puro y con pruebas, para
// que la pantalla y el botón de copiar digan exactamente lo mismo.

export interface TicketLike {
  strike: number;
  type: "call" | "put";
  expiration: string | null;
  bid: number;
  ask: number;
  mid: number;
  targetPx: number;
  stopPx: number;
  rbOption: number;
  cost: number;
  risk: number;
  gainPct: number;
  lossPct: number;
  approxPop: number;
  warning: string | null;
}

export interface SetupLike {
  direction: "long" | "short";
  entry: number;
  target: number;
  stop: number;
}

export type Estrategia = "iman" | "empujon";

export interface LineaTicket {
  icono: string;
  texto: string;
  /** Para pintar en color: bien, mal, aviso o normal. */
  tono: "bien" | "mal" | "aviso" | "normal";
}

/** Por defecto, 1% de la cuenta por operación (perfil conservador). */
export const REGLA_RIESGO_PCT = 1;

const d2 = (n: number) => `$${n.toFixed(2)}`;
const d0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const nivel = (n: number) =>
  n >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2).replace(/\.00$/, "");

/** "2026-09-25" → "vie 25 sep". */
function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "hoy" si vence hoy (hora de Nueva York), si no la fecha corta. */
export function cuandoVence(expiration: string | null, ahora: Date): string {
  if (!expiration) return "";
  const hoyNY = ahora.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return expiration === hoyNY ? "vence hoy" : `vence el ${fechaCorta(expiration)}`;
}

/**
 * ¿Cabe con la regla de riesgo? Devuelve cuánto se permite perder y cuántos
 * contratos caben (0 si ni uno).
 */
export function cabeEnCuenta(riesgoPorContrato: number, capital: number, reglaPct = REGLA_RIESGO_PCT) {
  const permitido = capital > 0 ? (capital * reglaPct) / 100 : 0;
  const contratos = riesgoPorContrato > 0 ? Math.floor(permitido / riesgoPorContrato) : 0;
  const pctDeCuenta = capital > 0 ? (riesgoPorContrato / capital) * 100 : null;
  return { permitido, contratos, pctDeCuenta };
}

export function lineasTicket(opts: {
  ticker: string;
  setup: SetupLike;
  ticket: TicketLike;
  estrategia: Estrategia;
  capital: number;
  ahora: Date;
  reglaPct?: number;
}): LineaTicket[] {
  const { ticker, setup, ticket: t, estrategia, capital, ahora } = opts;
  const regla = opts.reglaPct ?? REGLA_RIESGO_PCT;
  const sube = t.type === "call";
  const L: LineaTicket[] = [];

  L.push({
    icono: "🎟️",
    texto: `Ticket de ${ticker} · ${estrategia === "empujon" ? "día de empujón (ir con el movimiento)" : "día de rango (vuelta al imán)"}`,
    tono: "normal",
  });

  L.push({
    icono: sube ? "🟢" : "🔴",
    texto: `COMPRA ${ticker} ${nivel(t.strike)} ${sube ? "CALL (apuesta a que sube)" : "PUT (apuesta a que baja)"}`
      + `${t.expiration ? `, ${cuandoVence(t.expiration, ahora)}` : ""}, a ${d2(t.mid)}`
      + ` — te pagan ${d2(t.bid)} si vendes ya / te cobran ${d2(t.ask)} si compras ya`,
    tono: sube ? "bien" : "mal",
  });

  L.push({
    icono: "🎯",
    texto: `Toma la ganancia cuando el contrato llegue a ${d2(t.targetPx)}`
      + ` (sería con ${ticker} en ${nivel(setup.target)} · +${Math.round(t.gainPct)}%)`,
    tono: "bien",
  });

  L.push({
    icono: "🛑",
    texto: `Sal si baja a ${d2(t.stopPx)} (sería con ${ticker} en ${nivel(setup.stop)} · −${Math.round(t.lossPct)}%)`
      + ` · ganas ${t.rbOption.toFixed(1)} por cada 1 que arriesgas`,
    tono: "mal",
  });

  const c = cabeEnCuenta(t.risk, capital, regla);
  const pct = c.pctDeCuenta != null ? ` (${c.pctDeCuenta.toFixed(c.pctDeCuenta < 10 ? 1 : 0)}% de tu cuenta)` : "";
  L.push({
    icono: "💵",
    texto: `1 contrato te cuesta ${d0(t.cost)} y arriesgas ${d0(t.risk)}${pct}`
      + ` · probabilidad de terminar ganando ≈ ${Math.round(t.approxPop)}%`,
    tono: "normal",
  });

  if (capital > 0) {
    L.push(c.contratos >= 1
      ? {
          icono: "✅",
          texto: `Con tu regla del ${regla}% (${d0(c.permitido)} de pérdida máxima) te caben ${c.contratos} contrato${c.contratos === 1 ? "" : "s"}.`,
          tono: "bien",
        }
      : {
          icono: "⛔",
          texto: `No cabe en tu regla del ${regla}%: puedes perder hasta ${d0(c.permitido)} y este contrato arriesga ${d0(t.risk)}.`
            + ` Míralo para aprender, pero no lo tomes con esta cuenta.`,
          tono: "mal",
        });
  }

  if (t.warning) L.push({ icono: "⚠️", texto: t.warning, tono: "aviso" });

  // El mismo aviso que pone el Agente 0DTE: en contratos que se acaban hoy, la
  // cuenta de "cuánto valdría en la meta" sale optimista, porque el contrato
  // cambia de precio muy rápido y el cálculo lo estira de más.
  if (cuandoVence(t.expiration, ahora) === "vence hoy" && t.rbOption >= 2) {
    L.push({
      icono: "⚠️",
      texto: "La ganancia de la meta puede estar inflada: en contratos que se acaban hoy el cálculo sale optimista. Toma algo antes si se da.",
      tono: "aviso",
    });
  }

  const hora = ahora.toLocaleString("es-PR", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York",
  });
  L.push({ icono: "🕒", texto: `${hora} (hora de Nueva York)`, tono: "normal" });

  return L;
}

/** Todo el ticket como texto plano, para copiar y pegar. */
export function ticketComoTexto(lineas: LineaTicket[]): string {
  return lineas.map((l) => `${l.icono} ${l.texto}`).join("\n");
}
