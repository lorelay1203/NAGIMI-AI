"use client";

// Gamma Skew — la asimetría de la gamma: hacia qué lado se resbala el precio.
// Para daytrading: "sigo en el trade o me salgo". Se alimenta del GEX por
// strike que Nagimi ya calcula (gex.nodes). Si no hay nodos, no se pinta.

import type { GexAnalysis } from "@/lib/gex";
import { gammaSkew } from "@/lib/gammaSkew";

const LADO = {
  abajo: { txt: "Engrasado ABAJO", color: "var(--red-soft)", icon: "▼" },
  arriba: { txt: "Engrasado ARRIBA", color: "var(--green)", icon: "▲" },
  parejo: { txt: "Parejo", color: "var(--muted)", icon: "▬" },
} as const;

export default function GammaSkewCard({ gex }: { gex: GexAnalysis | null }) {
  if (!gex || !gex.nodes || gex.nodes.length === 0 || !(gex.spot > 0)) return null;

  const skew = gammaSkew(
    gex.nodes.map((n) => ({ strike: n.strike, netGex: n.netGex })),
    gex.spot,
    gex.flipStrike,
  );
  const lado = LADO[skew.ladoEngrasado];

  return (
    <section className="card skew">
      <div className="skew-head">
        <div>
          <div className="card-title">Gamma Skew — ¿hacia dónde se resbala?</div>
          <div className="card-sub">La asimetría de la gamma. Para decidir si sigues en el trade o te sales.</div>
        </div>
        <div className="skew-lado" style={{ color: lado.color }}>{lado.icon} {lado.txt}</div>
      </div>

      {/* Balanza: cuánta gamma que acelera hay a cada lado */}
      <div className="skew-balanza">
        <div className="skew-lado-lbl">↓ abajo</div>
        <div className="skew-track">
          <div
            className="skew-fill-abajo"
            style={{ width: `${skew.aceleraAbajo + skew.aceleraArriba > 0 ? (skew.aceleraAbajo / (skew.aceleraAbajo + skew.aceleraArriba)) * 100 : 50}%` }}
          />
        </div>
        <div className="skew-lado-lbl">arriba ↑</div>
      </div>

      {skew.distFlipPct != null && (
        <div className="skew-flip">
          Punto de cambio (flip) a <b>{skew.distFlipPct >= 0 ? "+" : ""}{skew.distFlipPct}%</b> del precio
          {" "}— {Math.abs(skew.distFlipPct) <= 0.3
            ? "pegadito: un empujón chico cambia el régimen."
            : "hay algo de colchón antes de que cambie el régimen."}
        </div>
      )}

      <div className="skew-lectura">{skew.lectura}</div>

      <div className="skew-pie">
        Se calcula con la gamma que ACELERA (gamma negativa) por strike. Material de estudio, no consejo financiero.
      </div>
    </section>
  );
}
