"use client";

import { useEffect, useMemo, useState } from "react";
import type { StructureScore } from "@/lib/structure";
import type { GexAnalysis } from "@/lib/gex";
import type { TfBar } from "@/lib/types";
import type { LevelsReport } from "@/lib/levels";
import { conePoints, expectedMove, levelProbabilities, predictionPath } from "@/lib/expectedMove";
import PriceChart, { type ChartTarget } from "./chart/PriceChart";
import { px } from "../format";

/** Bandas del heatmap: dorado = muro de calls · morado = muro de puts. */
function bandColor(side: "call" | "put", weight: number): string {
  const a = 0.05 + Math.pow(weight, 0.55) * 0.4;
  return side === "call" ? `rgba(212,160,23,${a})` : `rgba(124,110,228,${a})`;
}

/** El chip usa el color sólido del lado; la banda va traslúcida. */
function chipColor(side: "call" | "put"): string {
  return side === "call" ? "#b8880f" : "#6b5cd6";
}

/**
 * PRO — Strike Walls, probabilidad y ruta esperada.
 * En lugar de burbujas, cada nivel se pinta como BANDA de heatmap con su probabilidad,
 * y la proyección sale de la desviación estándar (cono 1σ/2σ), no de una línea inventada.
 */
export default function ProWallsCard({
  ticker,
  structure,
  gex,
  horizonDays,
  levels: srLevels,
}: {
  ticker: string;
  structure: StructureScore;
  gex: GexAnalysis | null;
  horizonDays: number;
  levels?: LevelsReport | null;
}) {
  const [bars, setBars] = useState<TfBar[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBars(null);
    fetch(`/api/bars?ticker=${encodeURIComponent(ticker)}&tf=1y`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setBars(Array.isArray(d.bars) ? d.bars.slice(-90) : []); })
      .catch(() => { if (!cancelled) setBars([]); });
    return () => { cancelled = true; };
  }, [ticker]);

  const spot = gex?.spot ?? 0;
  const iv = gex?.iv ?? 0.4;

  // Niveles con probabilidad = estadística de toque × concentración de dinero.
  const levels = useMemo(() => {
    if (!gex || !gex.nodes.length || !(spot > 0)) return [];
    return levelProbabilities(
      spot, iv, horizonDays,
      gex.nodes.map((n) => ({
        strike: n.strike, concentration: n.concentration, side: n.side, netGex: n.netGex,
      })),
    ).slice(0, 8);
  }, [gex, spot, iv, horizonDays]);

  const em = useMemo(() => expectedMove(spot, iv, horizonDays), [spot, iv, horizonDays]);
  const cone = useMemo(() => conePoints(spot, iv, horizonDays, 24), [spot, iv, horizonDays]);
  // El imán es el nivel de MAYOR PESO del heatmap (probabilidad × dinero), no el
  // nodo bruto del GEX: es el mismo número que se pinta en las bandas.
  const magnet = levels[0] ?? null;
  const path = useMemo(
    () => {
      const target = magnet?.strike ?? gex?.kingStrike ?? null;
      return target != null && spot > 0
        ? predictionPath(spot, target, iv, horizonDays, 12) : null;
    },
    [magnet, gex, spot, iv, horizonDays],
  );

  // Muros del heatmap → chips con precio y probabilidad, más su banda de color.
  const targets: ChartTarget[] = useMemo(
    () => levels.map((l) => ({
      key: String(l.strike),
      price: l.strike,
      label: l.side === "call" ? "Calls" : "Puts",
      sublabel: `${(l.magnet * 100).toFixed(0)}%`,
      color: chipColor(l.side),
      weight: l.magnet,
      bandColor: bandColor(l.side, l.magnet),
    })),
    [levels],
  );

  // Soportes y resistencias: solo los realmente fuertes, para no saturar.
  const srLines = useMemo(
    () => [...(srLevels?.resistances ?? []), ...(srLevels?.supports ?? [])]
      .filter((l) => l.strength >= 35)
      .map((l) => ({ price: l.price, kind: l.kind, strength: l.strength })),
    [srLevels],
  );

  const dirLabel = magnet
    ? magnet.strike > spot * 1.002 ? "al alza"
      : magnet.strike < spot * 0.998 ? "a la baja" : "lateral"
    : "—";

  return (
    <section className="pro-card">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="pro-title">🧱 Muros de dinero y hacia dónde jala el precio</div>
          <span className="pro-badge">PRO</span>
        </div>
        <div style={{ background: "var(--panel-2, rgba(255,255,255,0.04))", borderRadius: 10, padding: "10px 12px", marginTop: 8, fontSize: 12.5, lineHeight: 1.55 }}>
          <b>¿Para qué sirve?</b> Esta gráfica te muestra 3 cosas de {ticker}: <b>dónde está apostado el dinero grande</b> (las
          bandas de color = los "muros"), hacia qué precio <b>jala</b> el mercado (el imán 🧲), y <b>qué tan lejos</b> puede
          moverse en {horizonDays} días (el cono). Cuanto más fuerte el color de una banda, más dinero y más probable que el
          precio la toque.
        </div>
        {/* Cómo leer la gráfica */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(212,160,23,0.85)" }} />Muro de calls <b style={{ color: "var(--text)" }}>(techo)</b>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(124,110,228,0.85)" }} />Muro de puts <b style={{ color: "var(--text)" }}>(piso)</b>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "#f5c542" }} />Ruta esperada
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "2px dotted rgba(18,183,106,0.9)" }} />Soporte
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "2px dotted rgba(240,68,56,0.9)" }} />Resistencia
          </span>
        </div>
      </div>

      <div className="pro-chart">
        {bars === null && <div style={{ padding: 20, color: "#5c6a85", fontSize: 12 }}>Cargando velas…</div>}
        {bars !== null && bars.length === 0 && (
          <div style={{ padding: 20, color: "#5c6a85", fontSize: 12 }}>Sin datos de precio.</div>
        )}
        {bars !== null && bars.length > 0 && (
          <PriceChart
            bars={bars}
            spot={spot}
            horizonDays={horizonDays}
            cone={cone}
            series={path ? [{ key: "magnet", points: path.points, color: "#f5c542", width: 2.2 }] : []}
            targets={targets}
            levels={srLines}
            theme="dark"
            height="100%"
            showCone1
          />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
        <StatBox icon="📏" color="#3b82f6" label="Movimiento normal (1σ)"
          value={`±${em.sigmaPct.toFixed(1)}%`}
          sub={`$${px.format(em.lower1)} – $${px.format(em.upper1)}`}
          hint="Dónde estará 68 de cada 100 veces" />
        <StatBox icon="🌪️" color="#e0a800" label="Movimiento extremo (2σ)"
          value={`±${(em.sigmaPct * 2).toFixed(1)}%`}
          sub={`$${px.format(em.lower2)} – $${px.format(em.upper2)}`}
          hint="El caso raro (95 de 100 veces cae dentro)" />
        <StatBox icon="🧲" color="#f5c542" label="Imán (hacia dónde jala)"
          value={path ? `$${px.format(path.target)}` : "—"}
          sub={magnet ? `${(magnet.magnet * 100).toFixed(0)}% de peso · ${dirLabel}` : "—"}
          hint="El precio que más atrae al dinero" />
        <StatBox icon="📊" color="#8b5cf6" label="Nerviosismo (IV)"
          value={`${(iv * 100).toFixed(1)}%`}
          sub={gex ? (gex.regime === "positive" ? "γ+ tiende a revertir" : "γ− amplifica el movimiento") : "—"}
          hint="Más alto = se espera más movimiento" />
      </div>

      {(gex?.lowLiquidity || structure.notional.lowLiquidity) && (
        <div className="iv-special" style={{ marginTop: 10 }}>
          ⚠ <b>Cadena de baja liquidez</b> — la proyección se marca como poco fiable y no debe
          usarse para operar.
        </div>
      )}
    </section>
  );
}

/** Casilla de estadística con color e ícono propios, para que cada dato se distinga. */
function StatBox({ icon, color, label, value, sub, hint }: {
  icon: string; color: string; label: string; value: string; sub: string; hint: string;
}) {
  return (
    <div style={{ background: "var(--panel-2, rgba(255,255,255,0.04))", borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text)" }}>{sub}</div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}
