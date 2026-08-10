"use client";

// Curva de ganancia/pérdida al vencimiento — SVG puro, sin librerías.
// Dibuja P/L (eje Y) por precio del subyacente (eje X), zona verde (ganas) /
// roja (pierdes), break-evens, strikes y el spot actual.

import { plAtExpiry, type PayoffLeg } from "@/lib/payoff";

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function PayoffChart({
  legs,
  spot,
  breakevens,
}: {
  legs: PayoffLeg[];
  spot: number;
  breakevens: number[];
}) {
  if (legs.length === 0 || !(spot > 0)) return null;

  // Rango de precios: cubre strikes, spot y break-evens con margen.
  const strikes = legs.map((l) => l.strike);
  const anchors = [...strikes, spot, ...breakevens].filter((x) => x > 0);
  const rawLo = Math.min(...anchors);
  const rawHi = Math.max(...anchors);
  const pad = Math.max((rawHi - rawLo) * 0.35, spot * 0.06);
  const loS = Math.max(0.01, rawLo - pad);
  const hiS = rawHi + pad;

  // Muestreo de la curva.
  const N = 160;
  const pts: { S: number; pl: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const S = loS + ((hiS - loS) * i) / N;
    pts.push({ S, pl: plAtExpiry(legs, S) });
  }
  const plMin = Math.min(...pts.map((p) => p.pl), 0);
  const plMax = Math.max(...pts.map((p) => p.pl), 0);
  const plPad = Math.max((plMax - plMin) * 0.12, 1);
  const yLo = plMin - plPad;
  const yHi = plMax + plPad;

  // Geometría (viewBox 0..W x 0..H).
  const W = 520, H = 240;
  const mL = 8, mR = 8, mT = 14, mB = 22;
  const x = (S: number) => mL + ((S - loS) / (hiS - loS)) * (W - mL - mR);
  const y = (pl: number) => mT + (1 - (pl - yLo) / (yHi - yLo)) * (H - mT - mB);
  const yZero = y(0);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.S).toFixed(1)},${y(p.pl).toFixed(1)}`).join(" ");
  // Áreas rellenas (recortadas por la línea del cero con clip).
  const areaTop = `M${x(loS).toFixed(1)},${yZero.toFixed(1)} ${pts.map((p) => `L${x(p.S).toFixed(1)},${y(p.pl).toFixed(1)}`).join(" ")} L${x(hiS).toFixed(1)},${yZero.toFixed(1)} Z`;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>
        Curva de ganancia / pérdida al vencimiento
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} preserveAspectRatio="none">
        <defs>
          {/* Verde por encima del cero, rojo por debajo */}
          <clipPath id="pf-above"><rect x={0} y={0} width={W} height={yZero} /></clipPath>
          <clipPath id="pf-below"><rect x={0} y={yZero} width={W} height={H - yZero} /></clipPath>
        </defs>

        {/* Zona de ganancia (verde) y pérdida (roja) */}
        <path d={areaTop} fill="rgba(46,199,127,0.16)" clipPath="url(#pf-above)" />
        <path d={areaTop} fill="rgba(255,93,82,0.16)" clipPath="url(#pf-below)" />

        {/* Línea del break-even (P/L = 0) */}
        <line x1={mL} y1={yZero} x2={W - mR} y2={yZero} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />

        {/* Strikes (verticales tenues) */}
        {[...new Set(strikes)].map((k) => (
          <line key={"k" + k} x1={x(k)} y1={mT} x2={x(k)} y2={H - mB} stroke="var(--border-soft)" strokeWidth={1} strokeDasharray="2 3" />
        ))}

        {/* Break-evens */}
        {breakevens.map((b) => (
          <g key={"be" + b}>
            <line x1={x(b)} y1={mT} x2={x(b)} y2={H - mB} stroke="#f5c451" strokeWidth={1} />
            <text x={x(b)} y={H - 8} fill="#f5c451" fontSize={9} textAnchor="middle">${b}</text>
          </g>
        ))}

        {/* Spot actual */}
        <line x1={x(spot)} y1={mT} x2={x(spot)} y2={H - mB} stroke="var(--accent)" strokeWidth={1.5} />
        <text x={x(spot)} y={mT - 3} fill="var(--accent)" fontSize={9.5} fontWeight={700} textAnchor="middle">
          spot ${Math.round(spot)}
        </text>

        {/* Curva P/L */}
        <path d={line} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" />

        {/* Etiquetas máx ganancia / pérdida */}
        <text x={mL + 2} y={y(plMax) - 4 < mT + 8 ? mT + 10 : y(plMax) - 4} fill="#4ad991" fontSize={9.5} fontWeight={700}>
          {money(plMax)}
        </text>
        <text x={mL + 2} y={y(plMin) + 11 > H - mB ? H - mB - 3 : y(plMin) + 11} fill="#ff8a82" fontSize={9.5} fontWeight={700}>
          {money(plMin)}
        </text>
      </svg>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
        Verde = ganas · Rojo = pierdes · línea amarilla = punto de equilibrio · línea azul = precio actual.
      </div>
    </div>
  );
}
