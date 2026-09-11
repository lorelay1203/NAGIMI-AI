"use client";

import { explicaPuntaje } from "@/lib/explicaPuntaje";
import { describeMesa } from "@/lib/mesaAgentes";

export interface SentimentPart {
  name: string;
  note: string;
  score: number | null; // 0-10, null = pendiente
  weight: number;
}

function colorFor(score100: number): string {
  return score100 >= 60 ? "#12b76a" : score100 >= 45 ? "#667085" : "#f04438";
}

/**
 * AI Sentiment Score: los promedios de las tablas de cada sub-agente,
 * ponderados por su peso del scorecard, escalados a 0-100.
 */
export default function SentimentCard({ ticker, parts }: { ticker: string; parts: SentimentPart[] }) {
  const active = parts.filter((p) => p.score != null);
  const activeWeight = active.reduce((s, p) => s + p.weight, 0);
  const pts = active.reduce((s, p) => s + (p.score! / 10) * p.weight, 0);
  const score = activeWeight > 0 ? Math.round((pts / activeWeight) * 100) : 0;
  const scoreColor = colorFor(score);
  const scoreLabel = score >= 60 ? "Bullish" : score >= 45 ? "Neutral" : "Bearish";

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="card-title">AI Sentiment Score</div>
          <div className="card-sub">
            Qué tan positivo o negativo se ve el mercado para {ticker} ahora mismo, de 0 a 100.
            {active.length < parts.length && <> Basado en {active.length} de {parts.length} señales.</>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="sent-score" style={{ color: scoreColor }}>{score}</div>
          <div className="sent-label" style={{ color: scoreColor }}>{scoreLabel}</div>
        </div>
      </div>

      <div>
        <div style={{ position: "relative", paddingTop: 10 }}>
          <div className="sent-marker" style={{ left: `${score}%` }} />
          <div className="sent-band">
            <div style={{ borderRadius: "6px 2px 2px 6px", background: "#f97066" }} />
            <div style={{ background: "#d9a0a0" }} />
            <div style={{ background: "#d0d5dd" }} />
            <div style={{ background: "#9adbb9" }} />
            <div style={{ borderRadius: "2px 6px 6px 2px", background: "#32d583" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#667085", marginTop: 6 }}>
          <div>Bearish</div><div>Neutral</div><div>Bullish</div>
        </div>
      </div>

      {/* Por qué el puntaje es lo que es, en una línea (nivel boricua). */}
      {(() => {
        const porQue = explicaPuntaje(score, active.map((p) => ({ name: p.name, score: p.score, weight: p.weight })));
        return porQue ? <div className="sent-porque">{porQue}</div> : null;
      })()}

      {/* Mesa de Agentes: cada sub-agente como especialista, con qué mira,
          qué está viendo ahora y hacia dónde empuja. Reemplaza las barras
          planas — mismo dato, mucho más explicado (estilo Aetheris). */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div className="sent-head-label">Mesa de agentes — cada especialista, qué mira y qué ve ahora</div>
        <div className="mesa-grid">
          {describeMesa(parts.map((p) => ({ name: p.name, note: p.note, score: p.score, weight: p.weight }))).map((a) => {
            const s100 = a.score != null ? Math.round(a.score * 10) : null;
            const c = s100 != null ? colorFor(s100) : "var(--faint)";
            return (
              <div key={a.nombre} className={`mesa-card mesa-${a.tono}`}>
                <div className="mesa-top">
                  <span className="mesa-cod">{a.codigo}</span>
                  <span className="mesa-senal" style={{ color: c }}>{a.senal}</span>
                </div>
                <div className="mesa-nombre">{a.nombre} <span className="mesa-peso">· pesa {a.weight}%</span></div>
                <div className="mesa-quehace">{a.queHace}</div>
                <div className="mesa-viendo"><span className="mesa-viendo-lbl">Ahora:</span> {a.viendo}{s100 != null ? ` (${s100}/100)` : ""}</div>
                {a.empuje && <div className="mesa-empuje" style={{ color: c }}>{a.empuje}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
