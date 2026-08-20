"use client";

import type { MsGexResult } from "@/lib/marketsnackGex";
import { px } from "../format";

// Colores como en MarketSnack: CALLS verde, PUTS rojo, imán ámbar, flip tenue.
const CALL = "#2ec77f";  // call wall (resistencia) — verde
const PUT = "#ff5d52";   // put wall (soporte) — rojo
const MAG = "#e0a823";   // imán — ámbar
const FLIP = "#9a86ff";  // gamma flip — lila
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

// Un ítem de la barra de niveles (marcador de color + etiqueta + valor).
function LegendItem({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      <span style={{ width: 14, height: dashed ? 0 : 10, borderRadius: 2,
        background: dashed ? "transparent" : color,
        borderTop: dashed ? `2px dashed ${color}` : undefined, display: "inline-block" }} />
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

/**
 * GEX de MarketSnack como GRÁFICA: barra de niveles arriba (precio, muros, imán,
 * flip, net GEX) + precio intradía con los muros dibujados como líneas.
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
          <div className="pro-sub">El precio del día entre el put wall (soporte) y el call wall (resistencia), jalando hacia el imán. Datos reales de MarketSnack.</div>
        </div>
      </div>

      {/* Barra de niveles — soporte y resistencia en formato tipo MarketSnack */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center",
        padding: "11px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, marginTop: 4 }}>
        <LegendItem color={PRICE} label="Precio" value={`$${px.format(g.assetPrice)}`} />
        {g.callWall > 0 && <LegendItem color={CALL} label="Call Wall" value={`$${px.format(g.callWall)}`} />}
        {g.magnet > 0 && <LegendItem color={MAG} label="🧲 Imán" value={`$${px.format(g.magnet)}`} />}
        {g.putWall > 0 && <LegendItem color={PUT} label="Put Wall" value={`$${px.format(g.putWall)}`} />}
        {g.gammaFlip > 0 && <LegendItem color={FLIP} label="Gamma Flip" value={`$${px.format(g.gammaFlip)}`} dashed />}
        <LegendItem color={posRegime ? CALL : PUT} label="Net GEX" value={fmtGex(g.netGex)} />
        {g.maxPain > 0 && <LegendItem color="#7a8699" label="Max Pain" value={`$${px.format(g.maxPain)}`} />}
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="GEX intradía" style={{ display: "block", minWidth: 520 }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={padL - 6} y={yOf(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#8a93a6">${px.format(v)}</text>
            </g>
          ))}

          {Level(g.putWall, PUT, "Put wall")}
          {Level(g.callWall, CALL, "Call wall")}
          {Level(g.magnet, MAG, "Imán", "4 3")}
          {Level(g.gammaFlip, FLIP, "Flip", "2 3")}

          {series.length > 1 && <path d={pricePath} fill="none" stroke={PRICE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={lastX} cy={lastY} r={3.5} fill={PRICE} />
          <text x={lastX - 6} y={lastY - 8} textAnchor="end" fontSize={10} fontWeight={700} fill={PRICE}>${px.format(g.assetPrice)}</text>

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
          <b style={{ color: posRegime ? CALL : PUT }}>{fmtGex(g.netGex)}</b>
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
