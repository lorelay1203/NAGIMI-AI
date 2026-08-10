"use client";

import type { MsGexResult } from "@/lib/marketsnackGex";
import { px } from "../format";

const RES = "#ff5d52"; // call wall (resistencia)
const SUP = "#2ec77f"; // put wall (soporte)
const MAG = "#4d8bff"; // imán
const PRICE = "#e9ebf2";

function fmtGex(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}
function hhmm(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch { return ""; }
}

/**
 * GEX de MarketSnack como GRÁFICA: precio intradía + muros (call/put wall) e imán
 * dibujados como líneas. Se ve al precio moverse entre los muros y hacia el imán.
 */
export default function MarketSnackGexCard({ data }: { data: MsGexResult }) {
  const g = data.latest;
  const series = data.series ?? [];
  if (!g) return null;

  const posRegime = g.netGex >= 0;

  // Geometría.
  const W = 680, H = 300, padL = 52, padR = 76, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const prices = series.map((s) => s.assetPrice).filter((p) => p > 0);
  const levels = [g.callWall, g.putWall, g.magnet, g.gammaFlip].filter((x) => x > 0);
  const lo = Math.min(...prices, ...levels, g.assetPrice);
  const hi = Math.max(...prices, ...levels, g.assetPrice);
  const pad = (hi - lo) * 0.06 || 1;
  const y0 = lo - pad, y1 = hi + pad;
  const xOf = (i: number) => padL + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const yOf = (v: number) => padT + plotH - ((v - y0) / (y1 - y0)) * plotH;

  const pricePath = series.map((s, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)},${yOf(s.assetPrice).toFixed(1)}`).join(" ");
  const lastX = series.length ? xOf(series.length - 1) : padL + plotW;
  const lastY = yOf(g.assetPrice);

  const yTicks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];

  const Level = (v: number, color: string, label: string, dash?: string) =>
    v > 0 ? (
      <g key={label}>
        <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke={color} strokeWidth={1.5} strokeDasharray={dash} opacity={0.9} />
        <text x={W - padR + 5} y={yOf(v)} dominantBaseline="central" fontSize={10} fontWeight={700} fill={color}>
          {label} ${px.format(v)}
        </text>
      </g>
    ) : null;

  return (
    <section className="pro-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pro-title">GEX en vivo — precio, muros e imán</div>
            <span className="pro-badge">PRO</span>
          </div>
          <div className="pro-sub">
            El precio del día (línea clara) entre el <b style={{ color: SUP }}>put wall</b> (soporte) y el
            {" "}<b style={{ color: RES }}>call wall</b> (resistencia), jalando hacia el <b style={{ color: MAG }}>imán</b>.
            Datos reales de MarketSnack.
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="GEX intradía" style={{ display: "block", minWidth: 520 }}>
          {/* rejilla + eje Y */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={padL - 6} y={yOf(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#8a93a6">${px.format(v)}</text>
            </g>
          ))}

          {/* muros e imán */}
          {Level(g.putWall, SUP, "Put wall")}
          {Level(g.callWall, RES, "Call wall")}
          {Level(g.magnet, MAG, "Imán", "4 3")}

          {/* línea de precio intradía */}
          {series.length > 1 && <path d={pricePath} fill="none" stroke={PRICE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={lastX} cy={lastY} r={3.5} fill={PRICE} />
          <text x={lastX - 6} y={lastY - 8} textAnchor="end" fontSize={10} fontWeight={700} fill={PRICE}>${px.format(g.assetPrice)}</text>

          {/* eje X: primera y última hora */}
          {series.length > 1 && (
            <>
              <text x={padL} y={H - padB + 15} textAnchor="start" fontSize={10} fill="#8a93a6">{hhmm(series[0].t)}</text>
              <text x={W - padR} y={H - padB + 15} textAnchor="end" fontSize={10} fill="#8a93a6">{hhmm(series[series.length - 1].t)} ET</text>
            </>
          )}
        </svg>
      </div>

      <div className="heat-foot">
        <div>
          <span className="muted">Net GEX: </span>
          <b style={{ color: posRegime ? SUP : RES }}>{fmtGex(g.netGex)}</b>
          <span className="muted"> — {posRegime ? "γ+ estabiliza (rango)" : "γ− amplifica (tendencia)"}</span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Max pain ${px.format(g.maxPain)} · Gamma flip ${px.format(g.gammaFlip)}
        </div>
      </div>
      <div className="disclaimer">Datos de gamma de MarketSnack. No es consejo financiero.</div>
    </section>
  );
}
