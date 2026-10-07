// ⏱️ TCH · Técnicos — los MARCOS DE TIEMPO.
//
// El ROL PLANEADO de Aetheris para Técnicos incluye "add timeframe controls".
// La lectura diaria (medias de 20 y 50 días) ya existe en lib/agenteTecnico.ts;
// esto mira la misma pregunta —¿para dónde va?— en tres escalas:
//   · semanal  → la tendencia de fondo (meses)
//   · diario   → la tendencia de las próximas semanas
//   · por hora → lo que está pasando estos días
// Cuando las tres coinciden, la tendencia es más confiable. Cuando chocan, el
// precio está cambiando de idea y conviene más cuidado.

import { ema } from "./agenteTecnico";

export type Tendencia = "arriba" | "abajo" | "lateral";

export interface VelaFecha {
  /** YYYY-MM-DD (diarias) o segundos unix (por hora). */
  time: string | number;
  close: number;
}

/** Junta velas diarias en semanas (lunes a viernes), con el último cierre de cada semana. */
export function aSemanales(velas: VelaFecha[]): number[] {
  const porSemana = new Map<string, number>();
  for (const v of velas) {
    const d = typeof v.time === "number" ? new Date(v.time * 1000) : new Date(`${v.time}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const lunes = new Date(d);
    lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    porSemana.set(lunes.toISOString().slice(0, 10), v.close); // en orden: se queda el último de la semana
  }
  return [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, c]) => c);
}

/** Tendencia por medias rápida y lenta; con las medias casi pegadas (<0.5%) es lateral. */
export function tendenciaDe(cierres: number[], rapida: number, lenta: number): Tendencia | null {
  const r = ema(cierres, rapida);
  const l = ema(cierres, lenta);
  if (r == null || l == null || !(l > 0)) return null;
  const sep = Math.abs(r - l) / l * 100;
  if (sep < 0.5) return "lateral";
  return r > l ? "arriba" : "abajo";
}

export interface Marcos {
  semanal: Tendencia | null;
  diario: Tendencia | null;
  hora: Tendencia | null;
}

/**
 * Las tres tendencias:
 *   semanal  = media de 10 semanas contra la de 30 (≈ 50 y 150 días)
 *   diario   = media de 20 días contra la de 50
 *   por hora = media de 20 horas contra la de 50 (≈ 3 y 7 días de mercado)
 */
export function marcos(diarias: VelaFecha[], horas: VelaFecha[]): Marcos {
  return {
    semanal: tendenciaDe(aSemanales(diarias), 10, 30),
    diario: tendenciaDe(diarias.map((v) => v.close), 20, 50),
    hora: tendenciaDe(horas.map((v) => v.close), 20, 50),
  };
}

export interface LecturaMarcos {
  /** "coinciden" si los marcos disponibles dicen lo mismo. */
  acuerdo: "coinciden" | "chocan" | "parcial" | "sin datos";
  linea: string;
  consejo: string;
}

const palabra: Record<Tendencia, string> = { arriba: "para arriba", abajo: "para abajo", lateral: "de lado" };

export function lecturaMarcos(m: Marcos): LecturaMarcos {
  const lista: [string, Tendencia | null][] = [["semanal", m.semanal], ["diario", m.diario], ["por hora", m.hora]];
  const con = lista.filter(([, t]) => t != null) as [string, Tendencia][];
  if (con.length === 0) return { acuerdo: "sin datos", linea: "No hubo velas suficientes para leer los marcos de tiempo.", consejo: "" };

  const linea = "Marcos de tiempo: " + lista
    .map(([n, t]) => `${n} ${t ? palabra[t] : "sin datos"}`)
    .join(" · ") + ".";

  const dirs = new Set(con.map(([, t]) => t));
  const hayArriba = dirs.has("arriba"), hayAbajo = dirs.has("abajo");

  if (dirs.size === 1 && con.length === 3) {
    const t = con[0][1];
    return {
      acuerdo: "coinciden", linea,
      consejo: t === "lateral"
        ? "Los tres marcos van de lado: no hay tendencia que seguir en ninguna escala. Es terreno de rango."
        : `Los tres marcos dicen lo mismo (${palabra[t]}): la tendencia es firme en todas las escalas.`,
    };
  }
  if (hayArriba && hayAbajo) {
    const corto = m.hora, largo = m.semanal ?? m.diario;
    return {
      acuerdo: "chocan", linea,
      consejo: corto && largo && corto !== largo && corto !== "lateral" && largo !== "lateral"
        ? `Lo de estos días va ${palabra[corto]}, pero la tendencia de fondo va ${palabra[largo]}. `
          + "O es un respiro dentro de la tendencia grande, o la tendencia está empezando a cambiar: espera confirmación antes de apostar fuerte."
        : "Los marcos de tiempo no se ponen de acuerdo: el precio está cambiando de idea. Más cuidado y menos tamaño.",
    };
  }
  return {
    acuerdo: "parcial", linea,
    consejo: "Los marcos no chocan, pero tampoco coinciden del todo: la tendencia existe, pero no es firme en todas las escalas.",
  };
}
