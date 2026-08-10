"use client";

// Checklist de disciplina para confirmar la ENTRADA o la SALIDA de un trade.
// Cada punto es ESPECÍFICO (usa los datos reales del ticker: dirección, imán y
// muros de GEX, objetivo, stop) y trae una EXPLICACIÓN sencilla del porqué.
// No ejecuta órdenes ni da señales. Se guarda por ticker + modo en localStorage.

import { useEffect, useMemo, useState } from "react";
import { px } from "../format";

export interface ChecklistCtx {
  spot: number | null;
  direction: "up" | "down" | "flat" | null;
  callPct: number | null; // % del premium en calls (0-100)
  confidence: number | null; // 0-100
  caveat: string | null;
  lowLiquidity: boolean | null;
  baseTarget: number | null;
  baseChangePct: number | null;
  horizonDays: number;
  hitRate: number | null; // % histórico
  // Niveles REALES de GEX (MarketSnack). Si faltan, se usan los estimados.
  gexMagnet: number | null;
  gexCallWall: number | null; // resistencia
  gexPutWall: number | null; // soporte
  // Niveles estimados (respaldo).
  resistance: { price: number; distancePct: number } | null;
  support: { price: number; distancePct: number } | null;
  // Señales del flujo REAL de este ticker (para personalizar el checklist).
  aggression: number | null; // 0-100
  unusualCount: number | null; // # contratos con flujo inusual
  iv: number | null; // fracción (0.45 = 45%)
  topTrade: { type: "call" | "put"; strike: number; premium: number } | null; // la apuesta más grande
}

interface Item { text: string; why: string }
type Mode = "entrada" | "salida";

function confWord(c: number): string {
  return c >= 66 ? "alta" : c >= 33 ? "media" : "baja";
}
const money = (n: number) => `$${px.format(n)}`;

function buildEntry(c: ChecklistCtx): Item[] {
  const items: Item[] = [];
  // Resistencia / techo: muro real de GEX o el estimado.
  const ceiling = c.gexCallWall ?? c.resistance?.price ?? null;
  const floor = c.gexPutWall ?? c.support?.price ?? null;

  // 1) ¿Es confiable?
  if (c.caveat || c.lowLiquidity) {
    items.push({
      text: "🚫 Hoy la información de esta acción no es confiable. Mejor NO operarla.",
      why: "Si faltan datos, cualquier número puede estar mal. Es más inteligente esperar que apostar a ciegas.",
    });
  } else {
    items.push({
      text: "✅ La información de hoy es confiable.",
      why: "Hay suficientes datos para leer esta acción con tranquilidad.",
    });
  }

  // 2) ¿Para dónde va?
  if (c.direction === "up") {
    items.push({
      text: "📈 Los inversores grandes apuestan a que el precio SUBE. Para ir con ellos, comprarías un CALL.",
      why: "Un CALL es una apuesta a que sube: gana si el precio sube. Ir a favor de los grandes suele ser más seguro que ir en contra.",
    });
  } else if (c.direction === "down") {
    items.push({
      text: "📉 Los inversores grandes apuestan a que el precio BAJA. Para ir con ellos, comprarías un PUT.",
      why: "Un PUT es una apuesta a que baja: gana si el precio cae. Mejor remar a favor de la corriente, no en contra.",
    });
  } else {
    items.push({
      text: "➡️ No hay dirección clara: el precio está de lado. Lo mejor es esperar.",
      why: "Cuando nadie manda, entrar es como apostar a cara o cruz. Espera una señal más clara.",
    });
  }

  // Carácter del flujo (en simple)
  if (c.aggression != null) {
    if (c.aggression >= 66) items.push({ text: "⚡ Los compradores tienen MUCHA prisa por entrar. Señal fuerte.", why: "Cuando pagan de más con tal de entrar ya, es porque están muy convencidos." });
    else if (c.aggression <= 33) items.push({ text: "🐢 Los compradores no tienen prisa. Señal débil.", why: "Si nadie corre a entrar, la apuesta no es fuerte. Ve con más cuidado o espera." });
  }
  if (c.topTrade) {
    const t = c.topTrade;
    items.push({ text: `💰 La apuesta más grande de hoy fue ${money(t.premium)} a que ${t.type === "call" ? "SUBE" : "BAJA"} (cerca de $${t.strike}).`, why: "Fíjate a dónde pone el dinero el pez gordo: suele marcar hacia dónde miran los grandes." });
  }
  if (c.unusualCount != null && c.unusualCount > 0) {
    items.push({ text: `🔎 Hay ${c.unusualCount} movimiento(s) raro(s) hoy (mucho más de lo normal).`, why: "Actividad fuera de lo común suele avisar que algo está por moverse." });
  }
  if (c.iv != null && c.iv > 0) {
    const p = c.iv * 100;
    if (p >= 61) items.push({ text: `💸 Las opciones están CARAS hoy (volatilidad ${p.toFixed(0)}%).`, why: "Cuando están caras pagas de más, y puedes perder aunque aciertes la dirección. Ojo al comprar." });
    else if (p >= 40) items.push({ text: `🏷️ Las opciones están a buen precio hoy (volatilidad ${p.toFixed(0)}%).`, why: "Precio razonable: se espera movimiento y no pagas de más." });
    else items.push({ text: `😴 Se espera poco movimiento hoy (volatilidad ${p.toFixed(0)}%, baja).`, why: "Si casi no se mueve, la opción tampoco; quizá no valga la pena." });
  }

  // 3) Objetivo (el "imán")
  if (c.gexMagnet != null) {
    items.push({
      text: `🎯 El precio tiende a ser jalado hacia ${money(c.gexMagnet)}, como un imán. Ése es el objetivo más probable.`,
      why: "Es el nivel donde el precio suele terminar. Buen lugar para pensar en tomar tus ganancias.",
    });
  } else if (c.baseTarget != null && c.baseChangePct != null) {
    const sign = c.baseChangePct >= 0 ? "+" : "";
    items.push({
      text: `🎯 A dónde se espera que llegue el precio: ${money(c.baseTarget)} (${sign}${c.baseChangePct.toFixed(1)}%).`,
      why: "Decide AHÍ tomar tus ganancias, y decídelo ANTES de entrar.",
    });
  }

  // 4) Freno de emergencia (stop)
  if (c.direction === "up" && floor != null) {
    items.push({
      text: `🛑 Tu freno de emergencia: si el precio baja de ${money(floor)}, vende para no perder más.`,
      why: "Ese freno (los expertos lo llaman 'stop') evita que una mala jugada te vacíe la cuenta.",
    });
  } else if (c.direction === "down" && ceiling != null) {
    items.push({
      text: `🛑 Tu freno de emergencia: si el precio sube por encima de ${money(ceiling)}, vende y corta la pérdida.`,
      why: "Si el precio pasa ese punto, tu idea falló. Salir a tiempo protege tu dinero.",
    });
  } else {
    items.push({
      text: "🛑 Antes de entrar, decide tu freno de emergencia: a qué precio vendes si sale mal.",
      why: "Decídelo con la cabeza fría, no en el momento del susto.",
    });
  }

  // 5) Techo / piso cercano
  if (c.direction === "up" && ceiling != null) {
    items.push({
      text: `🔴 Hay un "techo" cerca, en ${money(ceiling)}: al precio le cuesta pasar de ahí.`,
      why: "En ese nivel hay muchas apuestas que frenan la subida. Buen lugar para tomar ganancias.",
    });
  } else if (c.direction === "down" && floor != null) {
    items.push({
      text: `🟢 Hay un "piso" cerca, en ${money(floor)}: ahí la caída suele frenarse.`,
      why: "En ese nivel el precio tiende a rebotar. No esperes que caiga mucho más.",
    });
  }

  // 6) Tamaño
  items.push({
    text: "📏 Arriesga como MÁXIMO el 1% de tu dinero en esta operación.",
    why: "Aunque te equivoques, sigues en el juego. Apostar de más es la forma #1 de quedarte sin cuenta.",
  });

  // 7) Historial
  if (c.hitRate != null) {
    const warn = c.hitRate < 50 ? " Como es menos de la mitad, ve con MÁS cuidado." : "";
    items.push({
      text: `📊 Señales parecidas antes acertaron ${Math.round(c.hitRate)} de cada 100 veces.${warn}`,
      why: "Es como el historial de esta señal. Más alto = más confiable.",
    });
  }

  // 8) Confianza
  if (c.confidence != null) {
    items.push({
      text: `🤝 Qué tan segura es la lectura de hoy: ${Math.round(c.confidence)}% (${confWord(c.confidence)}).`,
      why: "Si es baja, usa un tamaño aún más chico o espera a que se aclare.",
    });
  }

  return items;
}

function buildExit(c: ChecklistCtx): Item[] {
  const items: Item[] = [];
  const target = c.gexMagnet ?? c.baseTarget;
  const stopUp = c.gexPutWall ?? c.support?.price ?? null;
  const stopDown = c.gexCallWall ?? c.resistance?.price ?? null;

  items.push({
    text: target != null ? `✅ ¿El precio ya llegó a tu objetivo (~${money(target)})?` : "✅ ¿El precio ya llegó a donde esperabas?",
    why: "Si ya llegó, toma tus ganancias. Por querer más, muchas veces se devuelve lo ganado.",
  });

  if (c.direction === "up" && stopUp != null) {
    items.push({ text: `🛑 ¿El precio bajó de ${money(stopUp)} (tu freno)?`, why: "Ibas a que subía. Si cayó de tu freno, la idea falló: vende y protege tu dinero." });
  } else if (c.direction === "down" && stopDown != null) {
    items.push({ text: `🛑 ¿El precio subió por encima de ${money(stopDown)} (tu freno)?`, why: "Ibas a que bajaba. Si subió de tu freno, la idea falló: vende." });
  } else {
    items.push({ text: "🛑 ¿El precio tocó tu freno de emergencia?", why: "Si tocó el límite que pusiste, vende sin pensarlo. Para eso lo pusiste." });
  }

  if (c.direction === "up") {
    items.push({ text: "🔄 ¿El dinero grande ya dejó de apostar a que sube?", why: "Si los grandes cambiaron de bando, la razón por la que entraste ya no existe." });
  } else if (c.direction === "down") {
    items.push({ text: "🔄 ¿El dinero grande ya dejó de apostar a que baja?", why: "Si se dieron vuelta, tu apuesta se quedó sin respaldo." });
  } else {
    items.push({ text: "🔄 ¿Cambió hacia dónde apuesta el dinero grande desde que entraste?", why: "Si el ambiente cambió, tu motivo para seguir dentro también." });
  }

  items.push({ text: "📰 ¿Salió una noticia que va en contra de tu apuesta?", why: "Una noticia fuerte rompe cualquier análisis. No te quedes 'por terco'." });
  items.push({ text: `⏰ ¿Ya se te acabó el tiempo (${c.horizonDays} días)?`, why: "Las opciones pierden valor con el tiempo. Si tu plazo venció, cierra aunque no haya pasado nada." });

  return items;
}

export default function TradeChecklist({ ticker, ctx }: { ticker: string; ctx: ChecklistCtx }) {
  const [mode, setMode] = useState<Mode>("entrada");
  const entryItems = useMemo(() => buildEntry(ctx), [ctx]);
  const exitItems = useMemo(() => buildExit(ctx), [ctx]);
  const items = mode === "entrada" ? entryItems : exitItems;
  const key = `nagimi-checklist:${ticker}:${mode}`;
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  useEffect(() => {
    let arr: boolean[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === items.length) arr = parsed;
    } catch { /* ignore */ }
    setChecked(arr ?? items.map(() => false));
  }, [key, items.length]);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const clear = () => {
    setChecked(items.map(() => false));
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  };

  const done = checked.filter(Boolean).length;
  const total = items.length;
  const entryReady = mode === "entrada" && done === total;
  const exitSignal = mode === "salida" && done > 0;

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>✅ Checklist del trade · {ticker}</div>
          <div className="card-sub">
            Cada punto usa el análisis de {ticker} y explica el porqué en simple. Es tu disciplina, no una orden ni una señal.
          </div>
        </div>
        <div className="view-toggle">
          <button className={mode === "entrada" ? "active" : ""} onClick={() => setMode("entrada")}>Entrada</button>
          <button className={mode === "salida" ? "active" : ""} onClick={() => setMode("salida")}>Salida</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
              padding: "11px 13px", borderRadius: 10, cursor: "pointer",
              background: "var(--panel-2)", border: "1px solid var(--border-soft)",
              color: "var(--text)", font: "inherit",
            }}
          >
            <span
              style={{
                flex: "0 0 auto", width: 20, height: 20, borderRadius: 6, marginTop: 1,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: checked[i] ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: checked[i] ? "var(--accent)" : "transparent",
                color: "#fff", fontSize: 13, fontWeight: 700,
              }}
            >
              {checked[i] ? "✓" : ""}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, opacity: checked[i] ? 0.6 : 1, textDecoration: checked[i] ? "line-through" : "none" }}>
                {it.text}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>
                💡 {it.why}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{done}/{total} marcado{total === 1 ? "" : "s"}</div>
        <button type="button" onClick={clear} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", font: "inherit", fontSize: 13 }}>Reiniciar</button>
      </div>

      {entryReady && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--green-bg)", border: "1px solid var(--green-dark)", color: "var(--green)", fontWeight: 600 }}>
          ✓ Cumples todo tu plan de entrada. La decisión y la orden son tuyas.
        </div>
      )}
      {exitSignal && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--amber-bg)", border: "1px solid var(--amber-border)", color: "var(--amber-text)", fontWeight: 600 }}>
          ⚠ Hay {done} razón{done === 1 ? "" : "es"} para considerar salir. Revisa tu plan.
        </div>
      )}

      <div className="disclaimer">Checklist personal de disciplina. No es consejo financiero ni ejecuta órdenes.</div>
    </section>
  );
}
