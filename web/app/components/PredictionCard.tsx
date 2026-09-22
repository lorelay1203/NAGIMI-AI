"use client";

import type { ProPrediction, Scenario } from "@/lib/prediction";
import type { FlowRow } from "@/lib/flow";
import { money, px } from "../format";

const KIND: Record<Scenario["kind"], { label: string; color: string; bg: string }> = {
  bear: { label: "Bear case", color: "#ff8a82", bg: "rgba(255,93,82,0.12)" },
  base: { label: "Base case", color: "#c3ccdd", bg: "rgba(255,255,255,0.05)" },
  bull: { label: "Bull case", color: "#4ad991", bg: "rgba(46,199,127,0.12)" },
};

function ScenarioBox({ s }: { s: Scenario }) {
  const k = KIND[s.kind];
  return (
    <div className="sc-box" style={{ background: k.bg, borderColor: `${k.color}22` }}>
      <div className="sc-head" style={{ color: k.color }}>{k.label}</div>
      <div className="sc-target" style={{ color: k.color }}>${px.format(s.target)}</div>
      <div className="sc-chg" style={{ color: k.color }}>
        {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(1)}%
      </div>
      <div className="sc-prob">
        <div className="sc-prob-bar">
          <div style={{ width: `${Math.round(s.probability * 100)}%`, background: k.color }} />
        </div>
        <span>{(s.probability * 100).toFixed(0)}% de tocarlo</span>
      </div>
      <div className="sc-driver">{s.driver}</div>
    </div>
  );
}

/**
 * Prediction Pro — el DETALLE del veredicto: los tres escenarios (bear / base /
 * bull) con su probabilidad y los 3 flows más notables que sostienen la lectura.
 *
 * El resumen del agente y el selector de horizonte viven en el Veredicto (antes
 * se repetían aquí palabra por palabra): el horizonte cambia la conclusión, así
 * que va donde está la conclusión.
 */
export default function PredictionCard({
  ticker,
  prediction,
  horizonDays,
  topFlows,
}: {
  ticker: string;
  prediction: ProPrediction | null;
  horizonDays: number;
  topFlows: FlowRow[];
}) {
  return (
    <section className="card">
      <div>
        <div className="card-title">
          Los 3 escenarios <span className="pro-badge" style={{ marginLeft: 6 }}>PRO</span>
        </div>
        <div className="card-sub">
          Hasta dónde puede llegar {ticker} en {horizonDays} días, según dónde está el dinero y cuánto
          puede moverse el precio por volatilidad. El horizonte se cambia arriba, en el Veredicto.
        </div>
      </div>

      {!prediction ? (
        <div className="feed-empty">Calculando escenarios…</div>
      ) : (
        <>
          <div className="sc-grid">
            <ScenarioBox s={prediction.bear} />
            <ScenarioBox s={prediction.base} />
            <ScenarioBox s={prediction.bull} />
          </div>

          <div className="pred-conf">
            confianza {prediction.confidence}% · señales {prediction.score}/100 ·{" "}
            {prediction.active}/6 sub-agentes con dato
          </div>

          {topFlows.length > 0 && (
            <div>
              <div className="news-head">Top 3 flows notables</div>
              <div className="tf-list">
                {topFlows.slice(0, 3).map((f) => {
                  const alcista =
                    (f.type === "call" && f.aggression === "ask") ||
                    (f.type === "put" && f.aggression === "bid");
                  return (
                    <div key={f.id} className="tf-row">
                      <span className={`pill ${f.type === "call" ? "call" : "put"}`}>
                        {f.type === "call" ? "CALL" : "PUT"}
                      </span>
                      <div className="tf-body">
                        <div className="tf-title">
                          ${f.strike != null ? px.format(f.strike) : "?"}
                          <span className="muted">
                            {" "}· vence {f.expiration ?? "—"}
                            {f.dte != null && ` (${f.dte}d)`}
                          </span>
                        </div>
                        <div className="tf-sub">
                          {f.aggression === "ask" ? "Compra agresiva al ask" :
                            f.aggression === "bid" ? "Venta al bid" : "Ejecutado al medio"}
                          {" · "}
                          <b style={{ color: alcista ? "#4ad991" : "#ff6b6b" }}>
                            {alcista ? "apuesta alcista" : "apuesta bajista"}
                          </b>
                        </div>
                      </div>
                      <div className="tf-prem">{money.format(f.premium)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
