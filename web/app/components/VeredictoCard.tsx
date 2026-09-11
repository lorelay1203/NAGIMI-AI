"use client";

// Veredicto en lenguaje llano, con la "receta" de Aetheris/FinAnalista adaptada
// al flujo de opciones: un titular claro (¿sube o baja?), tres cajas cortas
// (a favor / en contra / vigila) y la pregunta directa "¿entro ahora a $X?".
// Todo sale de `ProPrediction` (ya calculado) — nunca se inventa un número.

import type { ProPrediction } from "@/lib/prediction";
import { escenarioOpuesto, rielAVigilar } from "@/lib/veredicto";
import { analogia } from "@/lib/analogia";
import { px } from "../format";

/** Confianza 0-100 → etiqueta llana. */
function confLabel(c: number): { text: string; cls: string } {
  if (c >= 66) return { text: "confianza alta", cls: "alta" };
  if (c >= 33) return { text: "confianza media", cls: "media" };
  return { text: "confianza baja", cls: "baja" };
}

const DIR = {
  up: { icon: "📈", word: "Probablemente SUBE", cls: "up" },
  down: { icon: "📉", word: "Probablemente BAJA", cls: "down" },
  flat: { icon: "➡️", word: "Se mueve LATERAL", cls: "flat" },
} as const;

const signo = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const prob = (p: number) => `${Math.round(p * 100)}%`;

export default function VeredictoCard({
  ticker,
  prediction,
  horizonDays,
  regime,
}: {
  ticker: string;
  prediction: ProPrediction | null;
  horizonDays: number;
  /** Régimen de gamma del día, para la analogía "esto es como…". */
  regime?: "positive" | "negative";
}) {
  if (!prediction) {
    return (
      <section className="verdict">
        <div className="verdict-loading">Armando la lectura de {ticker}…</div>
      </section>
    );
  }

  // Salvaguarda de liquidez — regla prioritaria: no dar dirección si no es fiable.
  if (prediction.caveat) {
    return (
      <section className="verdict verdict-warn">
        <div className="verdict-icon">⚠</div>
        <div>
          <div className="verdict-word">Datos no fiables — no operar</div>
          <div className="verdict-sub">{prediction.caveat}</div>
        </div>
      </section>
    );
  }

  const d = DIR[prediction.direction];
  const conf = confLabel(prediction.confidence);
  const base = prediction.base;

  const opuesto = escenarioOpuesto(prediction);
  const vigilaFinal = rielAVigilar(prediction.levels, prediction.spot, prediction.direction, base.target);
  const vigilaEsPiso = vigilaFinal?.esPiso ?? false;

  const horizonTxt = horizonDays === 10 ? "~1 semana" : horizonDays === 20 ? "~2 semanas" : "~4 semanas";

  return (
    <section className={`verdict verdict-${d.cls}`}>
      {/* Titular — la respuesta de una sola mirada */}
      <div className="verdict-head">
        <div className="verdict-icon">{d.icon}</div>
        <div className="verdict-body">
          <div className="verdict-word">
            {d.word} hacia <span className="verdict-target">${px.format(base.target)}</span>
            <span className="verdict-chg">{signo(base.changePct)}</span>
          </div>
          <div className="verdict-line">
            <span className={`verdict-conf ${conf.cls}`}>{conf.text}</span>
            <span className="verdict-horizon">· en las próximas {horizonTxt}</span>
            {prediction.calibration.applied && (
              <span
                className="verdict-cal"
                title={`El agente históricamente apunta ${prediction.calibration.shiftPct >= 0 ? "bajo" : "alto"}; se ajustó el target ${signo(prediction.calibration.shiftPct)} con ${prediction.calibration.samples} predicciones vencidas.`}
              >
                🧠 ajustado {signo(prediction.calibration.shiftPct)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tres cajas cortas — la receta de Aetheris, adaptada al flujo */}
      <div className="verdict-boxes">
        <div className="vbox vbox-fav">
          <div className="vbox-label">✓ A favor</div>
          <div className="vbox-text">
            El escenario base apunta a <b>${px.format(base.target)}</b> ({signo(base.changePct)}),
            con {prob(base.probability)} de probabilidad de tocarlo.
          </div>
          {base.driver && <div className="vbox-why">{base.driver}</div>}
        </div>

        <div className="vbox vbox-riesgo">
          <div className="vbox-label">⚠ En contra</div>
          <div className="vbox-text">
            Si el mercado gira, podría {opuesto.changePct >= 0 ? "subir" : "caer"} a <b>${px.format(opuesto.target)}</b> ({signo(opuesto.changePct)}),
            {" "}{prob(opuesto.probability)} de probabilidad.
          </div>
          {opuesto.driver && <div className="vbox-why">{opuesto.driver}</div>}
        </div>

        <div className="vbox vbox-vigila">
          <div className="vbox-label">👁 Vigila</div>
          {vigilaFinal ? (
            <div className="vbox-text">
              {vigilaEsPiso ? (
                <>Si baja, el piso más fuerte está en <b>${px.format(vigilaFinal.strike)}</b> — ahí suele frenar la caída. Pon una alerta.</>
              ) : (
                <>Si sube, el techo más fuerte está en <b>${px.format(vigilaFinal.strike)}</b> — ahí suele frenar la subida. Pon una alerta.</>
              )}
            </div>
          ) : (
            <div className="vbox-text">
              El nivel a vigilar es tu propio target: <b>${px.format(base.target)}</b>.
            </div>
          )}
        </div>
      </div>

      {/* "En términos simples: esto es como…" — la analogía del régimen */}
      <div className="verdict-analogia">
        <span className="verdict-analogia-tag">En simple</span>
        {analogia(prediction.direction, regime, prediction.confidence)}
      </div>

      {/* La pregunta directa — respondida con precio, como hace Aetheris */}
      <div className="verdict-pregunta">
        <div className="vpreg-q">¿Entro ahora a ${px.format(prediction.spot)}?</div>
        <div className="vpreg-a">{respuestaEntrada(prediction, vigilaFinal?.strike ?? null, vigilaEsPiso)}</div>
      </div>

      {prediction.summary && <div className="verdict-sub">{prediction.summary}</div>}
    </section>
  );
}

/** La respuesta a "¿entro ahora?", en llano, según qué tan clara es la señal. */
function respuestaEntrada(p: ProPrediction, riel: number | null, rielEsPiso: boolean): string {
  const alcista = p.direction === "up";
  const bajista = p.direction === "down";
  // El "riel" es el piso (si la señal sube) o el techo (si baja): el nivel donde
  // el precio suele frenar, útil como referencia de entrada o de stop.
  const rielTxt = riel != null
    ? ` ${rielEsPiso ? "El piso" : "El techo"} en $${px.format(riel)} es tu referencia: ahí el precio suele frenar`
    : "";

  if (p.direction === "flat" || p.confidence < 33) {
    return `Hoy la señal está floja: el precio no tiene un rumbo claro. Lo sensato es esperar `
      + `a que se defina.${rielTxt ? `${rielTxt}, así que sirve para saber si de verdad rompe.` : ""} `
      + `Entrar aquí es adivinar, no seguir una lectura.`;
  }
  if (p.confidence < 66) {
    return `La lectura se inclina a que ${alcista ? "sube" : bajista ? "baja" : "se mueve"}, pero con confianza media — `
      + `no es para entrar con todo. Si entras, hazlo pequeño.${rielTxt ? `${rielTxt}.` : " Define de antemano tu salida."}`;
  }
  return `La lectura apoya con fuerza que ${alcista ? "sube" : "baja"}. El escenario base apunta a $${px.format(p.base.target)} `
    + `(${signo(p.base.changePct)}) en las próximas ${p.horizonDays === 10 ? "1 semana" : p.horizonDays === 20 ? "2 semanas" : "4 semanas"}. `
    + `Aun así, arriesga solo lo que quepa en tu plan.${rielTxt ? `${rielTxt}.` : ""}`;
}
