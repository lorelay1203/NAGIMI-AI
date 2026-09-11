// ============================================================================
// "Reto Webull" — la escalera para subir la cuenta chica de a poco.
//
// Es el plan de Lorelay hecho rastreador: empezó con $10.75 y la idea es subir
// despacio, sin forzar opciones que no caben. Cada peldaño desbloquea algo real
// en Nagimi. Puro y testable — el saldo entra como número, no se lee aquí.
// ============================================================================

export interface Peldano {
  /** Piso del tramo (dólares). */
  desde: number;
  /** Meta del tramo — al cruzarla, sube de peldaño. Infinity en el último. */
  hasta: number;
  /** Qué se puede hacer en este tramo, en llano. */
  desbloquea: string;
}

/** La escalera. Debajo de $100 no hay opciones — solo acciones fraccionadas. */
export const ESCALERA: Peldano[] = [
  { desde: 0, hasta: 25, desbloquea: "Acciones fraccionadas de algo estable (pedacitos de SPY/QQQ). Nada volátil." },
  { desde: 25, hasta: 50, desbloquea: "Sigues fraccionado, pero ya puedes repartir en 2 — no todo en uno." },
  { desde: 50, hasta: 100, desbloquea: "Cerca del primer spread. Aguanta: a $100 se desbloquea riesgo topado." },
  { desde: 100, hasta: Infinity, desbloquea: "¡Tu primer spread de crédito ya cabe! Wheel (spread) y Venta de Prima." },
];

export interface EstadoReto {
  saldo: number;
  /** Índice del peldaño actual (0-based). */
  nivel: number;
  peldano: Peldano;
  /** Meta del peldaño actual (Infinity si es el último). */
  proximaMeta: number;
  /** Cuánto falta para la próxima meta. 0 si ya llegó al final. */
  falta: number;
  /** Progreso dentro del tramo, 0-100. */
  progresoPct: number;
  /** ¿Ya se puede operar opciones con riesgo topado? (>= $100) */
  desbloqueaOpciones: boolean;
  /** Frase de aliento en llano. */
  mensaje: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dónde está la cuenta en la escalera. Robusto a saldos raros (0, negativos). */
export function estadoReto(saldo: number): EstadoReto {
  const s = Number.isFinite(saldo) && saldo > 0 ? saldo : 0;
  const nivel = Math.max(0, ESCALERA.findIndex((p) => s < p.hasta));
  const peldano = ESCALERA[nivel] ?? ESCALERA[ESCALERA.length - 1];

  const finalizado = peldano.hasta === Infinity;
  const proximaMeta = peldano.hasta;
  const falta = finalizado ? 0 : round2(Math.max(0, peldano.hasta - s));
  const ancho = finalizado ? 1 : peldano.hasta - peldano.desde;
  const progresoPct = finalizado
    ? 100
    : Math.min(100, Math.max(0, Math.round(((s - peldano.desde) / ancho) * 100)));

  const mensaje = finalizado
    ? "Llegaste a los $100 — ya puedes hacer spreads de riesgo topado con constancia. El reto lo ganaste con disciplina, no con suerte."
    : `Te faltan $${falta.toFixed(2)} para los $${proximaMeta}. Cada depósito pequeño mueve la aguja más que cualquier jugada — sin apuro.`;

  return {
    saldo: round2(s),
    nivel,
    peldano,
    proximaMeta,
    falta,
    progresoPct,
    desbloqueaOpciones: s >= 100,
    mensaje,
  };
}
