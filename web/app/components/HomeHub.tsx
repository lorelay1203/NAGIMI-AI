"use client";

// Portada del panel: etiqueta pequeña, titular grande en serif, una línea de
// qué hace, "¿qué quieres analizar?" con el buscador y ejemplos de un clic, y
// debajo tu tabla.
//
// Al escribir un ticker (o tocar uno de los ejemplos) sale la tarjeta de
// cotización con el precio, el volumen, el VWAP y el máximo/mínimo del día,
// más el botón grande de análisis completo. Así se decide antes de gastar los
// ~40 segundos que tarda el análisis entero.

import { useEffect, useState } from "react";
import CotizacionCard from "./CotizacionCard";

type HomeHubProps = {
  onSearch: (ticker: string) => void;
  /** Va debajo del buscador — ahí vive "Tu investigación". */
  children?: React.ReactNode;
};

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

/** Un ticker sirve para pedir cotización si tiene de 1 a 5 letras. */
const esTicker = (t: string) => /^[A-Z]{1,5}$/.test(t);

export default function HomeHub({ onSearch, children }: HomeHubProps) {
  const [ticker, setTicker] = useState("");
  const [mirando, setMirando] = useState<string | null>(null);

  // Se espera medio segundo desde la última tecla para no pedir la cotización
  // de "N", "NV", "NVD" mientras todavía está escribiendo.
  useEffect(() => {
    const t = ticker.trim().toUpperCase();
    if (!esTicker(t)) { setMirando(null); return; }
    const id = setTimeout(() => setMirando(t), 500);
    return () => clearTimeout(id);
  }, [ticker]);

  const submit = () => {
    const value = ticker.trim().toUpperCase();
    if (!value) return;
    onSearch(value);
  };

  return (
    <section className="home-hub" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-kicker">Flujo de opciones · en vivo</div>
        <h1 id="home-title">Pregúntale a Nagimi <em>qué hacer hoy</em>.</h1>
        <p>
          Nagimi lee el flujo de opciones, los muros de gamma y el dinero que de verdad
          tienes en tus brókers, y te lo resume en pasos claros.
        </p>
      </div>

      <div className="home-ask">
        <h2>¿Qué quieres analizar hoy?</h2>
        <p>
          Escribe una acción o un ETF y Nagimi te da el flujo, los muros de gamma y un
          veredicto en lenguaje claro.
        </p>
        <div className="home-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
            placeholder="Busca un ticker, por ejemplo SPY…"
            aria-label="Ticker para analizar"
            spellCheck={false}
          />
          <button type="button" onClick={submit} aria-label="Analizar" title="Analizar">→</button>
        </div>
        <div className="home-try">
          <span>Prueba</span>
          {PRUEBA.map((t) => (
            <button key={t} type="button" onClick={() => setTicker(t)}>{t}</button>
          ))}
        </div>
      </div>

      {mirando && (
        <div className="home-cot">
          <CotizacionCard
            ticker={mirando}
            onAnalizar={onSearch}
            onCerrar={() => { setTicker(""); setMirando(null); }}
          />
        </div>
      )}

      {children}
    </section>
  );
}
