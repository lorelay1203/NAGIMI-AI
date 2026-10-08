// 🎯 "Si el precio llega a…" — un plan por cada nivel importante.
//
// Los muros dicen DÓNDE puede frenar el precio. Esto dice QUÉ HACER si llega
// ahí, en los dos casos posibles: que el muro aguante o que se rompa. Cada
// jugada trae la estrategia (en Spanglish, como sale en el bróker), los
// strikes, la meta, dónde salir y qué tan confiable es según el tipo de día y
// hacia dónde empuja el dinero.
//
// No trae precios de contratos: esos cambian cada segundo y se miran en el
// Ticket del día o en Venta de prima. Esto es el plan, para tenerlo listo antes
// de que el precio llegue.
//
// También vive aquí `filasNivel`, que junta techo y suelo del mismo precio en
// una "zona de pelea" y marca los muros que el precio ya cruzó; la tabla de
// niveles por vencimiento y estos planes usan exactamente la misma lectura.

import type { NivelConfirmado } from "./nivelesConfirmados";

// ---------------------------------------------------------------------------
// Filas de niveles (techo, suelo, zona de pelea, ya cruzado)
// ---------------------------------------------------------------------------

export type ClaseNivel = "techo" | "suelo" | "pelea" | "techo-roto" | "suelo-roto";

export interface FilaNivel {
  strike: number;
  clase: ClaseNivel;
  distanciaPct: number;
  veces: number;
  etiqueta: string;
  vencimientos: string[];
  probTocar: number | null;
  lectura: string;
}

export function filasNivel(niveles: NivelConfirmado[]): FilaNivel[] {
  const porStrike = new Map<number, NivelConfirmado[]>();
  for (const n of niveles) porStrike.set(n.strike, [...(porStrike.get(n.strike) ?? []), n]);

  const filas: FilaNivel[] = [];
  for (const [strike, ns] of porStrike) {
    const t = ns.find((n) => n.lado === "techo");
    const s = ns.find((n) => n.lado === "suelo");
    const base = (t ?? s)!;
    const prob = Math.max(...ns.map((n) => n.probTocar ?? -1));
    if (t && s) {
      filas.push({
        strike, clase: "pelea", distanciaPct: base.distanciaPct,
        veces: t.veces + s.veces,
        etiqueta: `techo en ${t.veces} · suelo en ${s.veces}`,
        vencimientos: [...new Set([...t.vencimientos, ...s.vencimientos])],
        probTocar: prob >= 0 ? prob : null,
        lectura: "Zona de pelea: en unos vencimientos frena las subidas y en otros las bajadas. El precio tiende a quedarse pegado aquí.",
      });
      continue;
    }
    const n = base;
    const roto = n.lado === "techo" ? n.distanciaPct < 0 : n.distanciaPct > 0;
    filas.push({
      strike, clase: roto ? (n.lado === "techo" ? "techo-roto" : "suelo-roto") : n.lado,
      distanciaPct: n.distanciaPct, veces: n.veces, etiqueta: n.etiqueta,
      vencimientos: n.vencimientos, probTocar: n.probTocar,
      lectura: roto
        ? n.lado === "techo"
          ? "El precio ya subió por encima de este techo. Si vuelve a bajar, este precio puede servirle de apoyo."
          : "El precio ya bajó por debajo de este suelo. Si vuelve a subir, este precio puede frenarlo."
        : n.lectura,
    });
  }
  return filas.sort((a, b) => b.strike - a.strike);
}

// ---------------------------------------------------------------------------
// Los planes
// ---------------------------------------------------------------------------

export type Confianza = "alta" | "media" | "baja";

export interface Jugada {
  /** Qué tiene que pasar. */
  si: string;
  /** Nombre de la estrategia, como sale en el bróker, con su explicación. */
  estrategia: string;
  /** Las patas en una línea: "vender call $785 · comprar call $786". */
  patas: string;
  meta: string;
  salida: string;
  confianza: Confianza;
  porQue: string;
  tono: "up" | "down" | "neutral";
}

export interface PlanNivel {
  precio: number;
  tipo: "techo" | "suelo" | "pelea";
  distanciaPct: number;
  veces: number;
  jugadas: Jugada[];
}

export interface PlanInput {
  ticker: string;
  spot: number;
  /** "positive" = día de rango · "negative" = día de empujón · null = no se sabe. */
  regimen: "positive" | "negative" | null;
  /** Parte del dinero que apuesta a que sube (0-1). null = no se pudo leer. */
  flujoAlcista: number | null;
  filas: FilaNivel[];
  /** Distancia entre strikes de la cadena (1 en SPY, 5 en SPX…). */
  paso: number;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
const redondear = (x: number, paso: number) => Math.round(x / paso) * paso;

/** De 0 a 3 puntos → confianza. */
function nivelConfianza(puntos: number): Confianza {
  return puntos >= 3 ? "alta" : puntos >= 2 ? "media" : "baja";
}

/** El dinero "manda" hacia un lado con 58% o más. */
function lado(f: number | null): "sube" | "baja" | "repartido" | null {
  if (f == null) return null;
  return f >= 0.58 ? "sube" : f <= 0.42 ? "baja" : "repartido";
}

export function planPorNiveles(i: PlanInput): PlanNivel[] {
  const { spot, regimen, paso, ticker: tk } = i;
  if (!(spot > 0) || !(paso > 0)) return [];
  const rango = regimen === "positive";
  const empujon = regimen === "negative";
  const dinero = lado(i.flujoAlcista);

  // Muros vivos: techos encima, suelos debajo, y zonas de pelea donde estén.
  const arriba = i.filas.filter((f) => f.strike > spot && (f.clase === "techo" || f.clase === "pelea")).sort((a, b) => a.strike - b.strike);
  const abajo = i.filas.filter((f) => f.strike < spot && (f.clase === "suelo" || f.clase === "pelea")).sort((a, b) => b.strike - a.strike);

  const planes: PlanNivel[] = [];

  // ---- El techo más cercano -------------------------------------------------
  const T = arriba[0];
  if (T) {
    const T2 = arriba[1]?.strike ?? redondear(T.strike * 1.01, paso);
    const S = abajo[0]?.strike ?? redondear(spot * 0.99, paso);
    const vende = redondear(T.strike + paso, paso);
    const compra = redondear(T.strike + 2 * paso, paso);
    const fuerte = T.veces >= 2 ? 1 : 0;
    planes.push({
      precio: T.strike, tipo: T.clase === "pelea" ? "pelea" : "techo", distanciaPct: T.distanciaPct, veces: T.veces,
      jugadas: [
        rango
          ? {
              si: `Si ${tk} llega a ${usd(T.strike)} y no lo puede pasar (dos velas de 5 min cerrando por debajo)`,
              estrategia: "Call credit spread — venta con pérdida máxima amarrada, por encima del techo",
              patas: `vender call ${usd(vende)} · comprar call ${usd(compra)}`,
              meta: `Quedarte con lo que cobras si cierra por debajo de ${usd(vende)}`,
              salida: `Si una vela de 5 min cierra por encima de ${usd(vende)}`,
              confianza: nivelConfianza(1 + fuerte + (dinero !== "sube" ? 1 : 0)),
              porQue: `Día de rango: los techos aguantan.${T.veces >= 2 ? ` Este se repite en ${T.veces} vencimientos.` : ""}${dinero === "sube" ? " Ojo: el dinero está comprando, el techo puede ceder." : ""}`,
              tono: "down",
            }
          : {
              si: `Si ${tk} llega a ${usd(T.strike)} y lo rechaza con el dinero vendiendo`,
              estrategia: "Put debit spread — apuesta a que baja, con costo amarrado",
              patas: `comprar put ${usd(T.strike)} · vender put ${usd(S)}`,
              meta: `${usd(S)} (el suelo más cercano)`,
              salida: `Si vuelve a cerrar por encima de ${usd(T.strike)}`,
              confianza: nivelConfianza(fuerte + (dinero === "baja" ? 1 : 0)),
              porQue: empujon
                ? "Día de empujón: si el techo rechaza, la caída se puede estirar. Pero en estos días los techos aguantan menos: espera la confirmación."
                : "No se sabe el tipo de día: espera la confirmación del rechazo.",
              tono: "down",
            },
        {
          si: `Si rompe ${usd(T.strike)} y se sostiene arriba con el dinero comprando`,
          estrategia: "Call debit spread — apuesta a que sube, con costo amarrado",
          patas: `comprar call ${usd(T.strike)} · vender call ${usd(T2)}`,
          meta: `${usd(T2)} (el próximo techo)`,
          salida: `Si vuelve a cerrar por debajo de ${usd(T.strike)}`,
          confianza: nivelConfianza((empujon ? 2 : 0) + (dinero === "sube" ? 1 : 0)),
          porQue: empujon
            ? "Día de empujón: cuando rompe un techo, el movimiento se estira."
            : "En día de rango las rupturas fallan seguido: entra solo si se sostiene arriba y el dinero acompaña.",
          tono: "up",
        },
      ],
    });
  }

  // ---- El suelo más cercano -------------------------------------------------
  const S = abajo[0];
  if (S) {
    const S2 = abajo[1]?.strike ?? redondear(S.strike * 0.99, paso);
    const Tcerca = arriba[0]?.strike ?? redondear(spot * 1.01, paso);
    const vende = redondear(S.strike - paso, paso);
    const compra = redondear(S.strike - 2 * paso, paso);
    const fuerte = S.veces >= 2 ? 1 : 0;
    planes.push({
      precio: S.strike, tipo: S.clase === "pelea" ? "pelea" : "suelo", distanciaPct: S.distanciaPct, veces: S.veces,
      jugadas: [
        rango
          ? {
              si: `Si ${tk} baja a ${usd(S.strike)} y rebota (dos velas de 5 min cerrando por encima)`,
              estrategia: "Put credit spread — venta con pérdida máxima amarrada, por debajo del suelo",
              patas: `vender put ${usd(vende)} · comprar put ${usd(compra)}`,
              meta: `Quedarte con lo que cobras si cierra por encima de ${usd(vende)}`,
              salida: `Si una vela de 5 min cierra por debajo de ${usd(vende)}`,
              confianza: nivelConfianza(1 + fuerte + (dinero !== "baja" ? 1 : 0)),
              porQue: `Día de rango: los suelos aguantan.${S.veces >= 2 ? ` Este se repite en ${S.veces} vencimientos.` : ""}${dinero === "baja" ? " Ojo: el dinero está vendiendo, el suelo puede ceder." : ""}`,
              tono: "up",
            }
          : {
              si: `Si ${tk} baja a ${usd(S.strike)} y rebota con el dinero comprando`,
              estrategia: "Call debit spread — apuesta al rebote, con costo amarrado",
              patas: `comprar call ${usd(S.strike)} · vender call ${usd(Tcerca)}`,
              meta: `${usd(Tcerca)} (el techo más cercano)`,
              salida: `Si vuelve a cerrar por debajo de ${usd(S.strike)}`,
              confianza: nivelConfianza(fuerte + (dinero === "sube" ? 1 : 0)),
              porQue: empujon
                ? "Día de empujón: los suelos aguantan menos. Entra solo con el rebote ya confirmado."
                : "No se sabe el tipo de día: espera la confirmación del rebote.",
              tono: "up",
            },
        {
          si: `Si pierde ${usd(S.strike)} y se queda abajo con el dinero vendiendo`,
          estrategia: "Put debit spread — apuesta a que baja, con costo amarrado",
          patas: `comprar put ${usd(S.strike)} · vender put ${usd(S2)}`,
          meta: `${usd(S2)} (el próximo suelo)`,
          salida: `Si vuelve a cerrar por encima de ${usd(S.strike)}`,
          confianza: nivelConfianza((empujon ? 2 : 0) + (dinero === "baja" ? 1 : 0)),
          porQue: empujon
            ? "Día de empujón: cuando se pierde un suelo, la caída se estira."
            : "En día de rango las caídas suelen frenarse: entra solo si se queda abajo y el dinero acompaña.",
          tono: "down",
        },
      ],
    });
  }

  // ---- Si se queda encerrado entre los dos ----------------------------------
  if (T && S && rango) {
    const cVende = redondear(T.strike + paso, paso), cCompra = redondear(T.strike + 2 * paso, paso);
    const pVende = redondear(S.strike - paso, paso), pCompra = redondear(S.strike - 2 * paso, paso);
    planes.push({
      precio: spot, tipo: "pelea", distanciaPct: 0, veces: 0,
      jugadas: [{
        si: `Si ${tk} se queda encerrado entre ${usd(S.strike)} y ${usd(T.strike)}`,
        estrategia: "Iron condor — vender arriba y abajo a la vez, con pérdida máxima amarrada",
        patas: `vender call ${usd(cVende)} · comprar call ${usd(cCompra)} · vender put ${usd(pVende)} · comprar put ${usd(pCompra)}`,
        meta: `Quedarte con todo lo cobrado si cierra entre ${usd(pVende)} y ${usd(cVende)}`,
        salida: "Si una vela de 5 min cierra fuera del rango, cierra el lado que se está rompiendo",
        confianza: nivelConfianza(2 + (dinero === "repartido" ? 1 : 0)),
        porQue: `Día de rango${dinero === "repartido" ? " y el dinero sin dueño claro" : ""}: lo más probable es que el precio se quede entre los dos muros.`,
        tono: "neutral",
      }],
    });
  }

  return planes;
}
