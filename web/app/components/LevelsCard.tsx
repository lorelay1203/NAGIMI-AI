"use client";

import { useState } from "react";
import type { Level, LevelsReport } from "@/lib/levels";
import { int, money, px } from "../format";

/** Genera un indicador de TradingView (Pine v5) con líneas en cada nivel. */
function buildPine(r: LevelsReport, ticker: string): string {
  const out = ["//@version=5", `indicator("Nagimi S/R — ${ticker}", overlay=true)`];
  for (const l of r.resistances) out.push(`hline(${l.price}, "R ${l.price}", color=color.new(color.red, 0), linewidth=${l.strength >= 50 ? 2 : 1})`);
  for (const l of r.supports) out.push(`hline(${l.price}, "S ${l.price}", color=color.new(color.green, 0), linewidth=${l.strength >= 50 ? 2 : 1})`);
  return out.join("\n");
}

/** Genera un estudio de thinkorswim (thinkScript) con líneas horizontales en cada nivel. */
function buildThink(r: LevelsReport, ticker: string): string {
  const out = [`# Nagimi S/R — ${ticker}`];
  r.resistances.forEach((l, i) => out.push(`plot R${i + 1} = ${l.price};`, `R${i + 1}.SetDefaultColor(Color.RED);`, `R${i + 1}.SetStyle(Curve.FIRM);`));
  r.supports.forEach((l, i) => out.push(`plot S${i + 1} = ${l.price};`, `S${i + 1}.SetDefaultColor(Color.GREEN);`, `S${i + 1}.SetStyle(Curve.FIRM);`));
  return out.join("\n");
}

const SUP = "#12b76a";
const RES = "#f04438";

function strengthLabel(s: number): string {
  if (s >= 70) return "Muy fuerte";
  if (s >= 50) return "Fuerte";
  if (s >= 30) return "Moderado";
  return "Débil";
}

function Row({ l }: { l: Level }) {
  const color = l.kind === "soporte" ? SUP : RES;
  return (
    <div className="lvl-row">
      <div className="lvl-price" style={{ color }}>
        ${px.format(l.price)}
        <span className="lvl-dist">
          {l.distancePct >= 0 ? "+" : ""}{l.distancePct.toFixed(1)}%
        </span>
      </div>
      <div className="lvl-mid">
        <div className="lvl-bar">
          <div style={{ width: `${l.strength}%`, background: color }} />
        </div>
        <div className="lvl-why">{l.why}</div>
      </div>
      <div className="lvl-strength">
        <b style={{ color }}>{l.strength}</b>
        <span>{strengthLabel(l.strength)}</span>
        {l.flipped && <span className="lvl-flip">flipeado</span>}
      </div>
    </div>
  );
}

/**
 * Soportes y resistencias — cruce del precio (pivotes reales) con las opciones
 * (venta de calls = resistencia, venta de puts = soporte).
 */
export default function LevelsCard({ r, ticker }: { r: LevelsReport; ticker: string }) {
  const has = r.supports.length > 0 || r.resistances.length > 0;
  const [code, setCode] = useState("");
  const [fmt, setFmt] = useState("");
  const [copied, setCopied] = useState(false);
  const showCode = (f: string, c: string) => { setFmt(f); setCode(c); setCopied(false); };
  const copy = () => { navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {}); };

  return (
    <section className="card">
      <div>
        <div className="card-title">Soportes y resistencias</div>
        <div className="card-sub">
          Dónde el precio de {ticker} ya frenó antes y dónde hay dinero puesto para frenarlo.
          La fuerza mezcla los rebotes reales con el posicionamiento en opciones.
        </div>
      </div>

      {!has ? (
        <div className="feed-empty">Sin niveles claros en el rango operativo.</div>
      ) : (
        <>
          {(r.keyResistance || r.keySupport) && (
            <div className="lvl-key">
              {r.keyResistance && (
                <div className="lvl-key-box" style={{ borderColor: `${RES}33`, background: "rgba(255,93,82,0.12)" }}>
                  <div className="lvl-key-label" style={{ color: RES }}>Resistencia clave</div>
                  <div className="lvl-key-price" style={{ color: RES }}>${px.format(r.keyResistance.price)}</div>
                  <div className="lvl-key-sub">
                    {r.keyResistance.distancePct >= 0 ? "+" : ""}{r.keyResistance.distancePct.toFixed(1)}% ·
                    fuerza {r.keyResistance.strength}/100
                  </div>
                </div>
              )}
              {r.keySupport && (
                <div className="lvl-key-box" style={{ borderColor: `${SUP}33`, background: "rgba(46,199,127,0.12)" }}>
                  <div className="lvl-key-label" style={{ color: SUP }}>Soporte clave</div>
                  <div className="lvl-key-price" style={{ color: SUP }}>${px.format(r.keySupport.price)}</div>
                  <div className="lvl-key-sub">
                    {r.keySupport.distancePct.toFixed(1)}% · fuerza {r.keySupport.strength}/100
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Una sola escalera: techos arriba (el más cercano pegado al precio),
              el precio en medio y los suelos abajo. Antes había además un
              dibujo con los mismos niveles: era la misma información dos veces. */}
          <div className="lvl-escalera">
            {r.resistances.length > 0 && (
              <>
                <div className="news-head">🔴 Techos (resistencias) — por encima del precio</div>
                <div className="lvl-list">
                  {[...r.resistances].sort((a, b) => b.price - a.price).map((l) => <Row key={`r${l.price}`} l={l} />)}
                </div>
              </>
            )}

            <div className="lvl-spot">
              <span className="lvl-spot-line" aria-hidden="true" />
              Precio ahora · <b>${px.format(r.spot)}</b>
              <span className="lvl-spot-line" aria-hidden="true" />
            </div>

            {r.supports.length > 0 && (
              <>
                <div className="news-head">🟢 Suelos (soportes) — por debajo del precio</div>
                <div className="lvl-list">
                  {[...r.supports].sort((a, b) => b.price - a.price).map((l) => <Row key={`s${l.price}`} l={l} />)}
                </div>
              </>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
            <div className="news-head">📍 Marcar estos niveles en tu gráfica</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => showCode("TradingView", buildPine(r, ticker))}
                style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }}>
                📈 TradingView (Pine)
              </button>
              <button type="button" onClick={() => showCode("thinkorswim", buildThink(r, ticker))}
                style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }}>
                📊 thinkorswim (TOS)
              </button>
            </div>
            {code && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
                  {fmt === "TradingView"
                    ? "En TradingView: abre el Pine Editor (abajo), borra lo que haya, pega esto y pulsa «Add to chart»."
                    : "En thinkorswim: Charts → Studies → Edit studies → Create → pega esto en el editor thinkScript y guarda."}
                </div>
                <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()}
                  style={{ width: "100%", minHeight: 110, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 10, fontSize: 11.5, fontFamily: "monospace", resize: "vertical" }} />
                <button type="button" onClick={copy}
                  style={{ marginTop: 6, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>
                  {copied ? "✓ Copiado" : "📋 Copiar"}
                </button>
              </div>
            )}
          </div>

          <div className="iv-note">
            Un nivel vale más cuando <b>coincide</b> el precio y las opciones: que ya haya
            rebotado ahí <i>y</i> que además haya dinero puesto. Los niveles se agrupan con una
            tolerancia de {r.tolerancePct}% — $299 y $301 son el mismo techo, no dos.
            <b> Flipeado</b> = era techo y ahora hace de suelo (o al revés).
          </div>
        </>
      )}
    </section>
  );
}
