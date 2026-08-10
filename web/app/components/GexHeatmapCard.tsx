"use client";

import { useMemo, useState } from "react";
import type { GexHeatmap, HeatStrike } from "@/lib/gexHeatmap";
import { money, px } from "../format";

// Par divergente: verde = gamma positiva (dealer estabiliza) · rojo = negativa (amplifica).
const POS = "#2ec77f";
const NEG = "#ff5d52";

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Perfil de GEX por strike — GRÁFICA de barras verticales (estilo Strike Profile):
 * eje X = strike, eje Y = gamma neta (0 al centro). Barra ARRIBA verde = γ+ (estabiliza),
 * ABAJO roja = γ− (amplifica). Línea punteada = precio actual (Spot).
 */
export default function GexHeatmapCard({ h }: { h: GexHeatmap }) {
  const [hover, setHover] = useState<HeatStrike | null>(null);

  // Strikes de menor a mayor precio (izquierda → derecha).
  const asc = useMemo(() => [...h.strikes].sort((a, b) => a.strike - b.strike), [h.strikes]);

  // Geometría.
  const W = 900;
  const Hh = 420;
  const padL = 52, padR = 14, padT = 18, padB = 30;
  const plotW = W - padL - padR;
  const plotH = Hh - padT - padB;
  const zeroY = padT + plotH / 2;
  const slot = asc.length > 0 ? plotW / asc.length : plotW;
  const barW = Math.max(2, slot * 0.62);
  const maxAbs = useMemo(() => Math.max(...asc.map((s) => Math.abs(s.netGex)), 1), [asc]);
  const scaleY = (plotH / 2) / maxAbs;

  const cx = (i: number) => padL + (i + 0.5) * slot;

  // Posición X del spot (interpolada entre strikes).
  const spotX = useMemo(() => {
    if (asc.length === 0) return padL;
    if (h.spot <= asc[0].strike) return cx(0);
    if (h.spot >= asc[asc.length - 1].strike) return cx(asc.length - 1);
    let i = 0;
    while (i < asc.length - 1 && asc[i + 1].strike < h.spot) i++;
    const frac = (h.spot - asc[i].strike) / (asc[i + 1].strike - asc[i].strike || 1);
    return cx(i) + frac * slot;
  }, [asc, h.spot, slot]);

  // Etiquetas del eje X (~10 strikes) y niveles del eje Y.
  const xStep = Math.max(1, Math.ceil(asc.length / 10));
  const yLevels = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
  const yOf = (v: number) => zeroY - v * scaleY;

  if (asc.length === 0) return null;

  return (
    <section className="pro-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pro-title">GEX por strike — perfil de gamma</div>
            <span className="pro-badge">PRO</span>
          </div>
          <div className="pro-sub">
            Cada barra es la gamma neta en ese strike. <b>Verde arriba</b> = el dealer estabiliza
            (el precio tiende a revertir); <b>rojo abajo</b> = amplifica (el movimiento acelera).
            La línea punteada es el precio actual.
          </div>
        </div>
        <div className="pro-legend" style={{ paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: POS }} />γ+ estabiliza
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: NEG }} />γ− amplifica
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label="Perfil de GEX por strike" style={{ display: "block", minWidth: 560 }}>
          {/* Rejilla + eje Y */}
          {yLevels.map((v) => (
            <g key={v}>
              <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)}
                stroke={v === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)"} strokeWidth={1} />
              <text x={padL - 6} y={yOf(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#8a93a6">
                {v === 0 ? "0" : fmtGex(v)}
              </text>
            </g>
          ))}

          {/* Barras */}
          {asc.map((s, i) => {
            const pos = s.netGex >= 0;
            const bh = Math.max(1, Math.abs(s.netGex) * scaleY);
            const x = cx(i) - barW / 2;
            const y = pos ? zeroY - bh : zeroY;
            return (
              <g key={s.strike} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)}>
                <rect x={cx(i) - slot / 2} y={padT} width={slot} height={plotH} fill="transparent" />
                <rect x={x} y={y} width={barW} height={bh} rx={2} fill={pos ? POS : NEG}
                  opacity={hover && hover.strike === s.strike ? 1 : 0.9} />
              </g>
            );
          })}

          {/* Etiquetas eje X (strikes) */}
          {asc.map((s, i) => (i % xStep === 0 ? (
            <text key={`x${s.strike}`} x={cx(i)} y={Hh - padB + 16} textAnchor="middle" fontSize={10} fill="#8a93a6">
              {px.format(s.strike)}
            </text>
          ) : null))}

          {/* Línea del Spot */}
          <line x1={spotX} y1={padT - 4} x2={spotX} y2={Hh - padB} stroke="#4d8bff" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={spotX} y={padT - 7} textAnchor="middle" fontSize={10} fontWeight={700} fill="#4d8bff">
            Spot ${px.format(h.spot)}
          </text>
        </svg>
      </div>

      <div className="heat-foot">
        <div>
          <span className="muted">GEX neto total: </span>
          <b style={{ color: h.totalNetGex >= 0 ? POS : NEG }}>{fmtGex(h.totalNetGex)}</b>
          <span className="muted">
            {" "}— régimen {h.totalNetGex >= 0 ? "γ+ (rango: conviene desvanecer extremos)" : "γ− (tendencia: conviene seguir el movimiento)"}
          </span>
        </div>
        {hover ? (
          <div className="heat-hover">
            <b>${px.format(hover.strike)}</b> ({hover.distancePct >= 0 ? "+" : ""}{hover.distancePct.toFixed(1)}%) · GEX{" "}
            <b style={{ color: hover.netGex >= 0 ? POS : NEG }}>{fmtGex(hover.netGex)}</b> · calls {fmtGex(hover.callGex)} · puts {fmtGex(-hover.putGex)}
            {" "}· OI {money.format(hover.openInterest).replace("$", "")}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 11 }}>Pasa el cursor por una barra para ver el detalle (calls/puts/OI).</div>
        )}
      </div>
    </section>
  );
}
