"use client";

// Portada del panel, con el mismo orden que la de FinAnalista: etiqueta
// pequeña, titular grande en serif, una línea de qué hace, "¿qué quieres
// analizar?" con el buscador y ejemplos de un clic, y debajo tu tabla.
//
// Las tarjetas de "caminos" (Day Trades, Wheel, Reportes…) se quitaron: eran
// los mismos enlaces del menú lateral, repetidos.

import { useState } from "react";

type HomeHubProps = {
  onSearch: (ticker: string) => void;
  /** Va debajo del buscador — ahí vive "Tu investigación". */
  children?: React.ReactNode;
};

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

export default function HomeHub({ onSearch, children }: HomeHubProps) {
  const [ticker, setTicker] = useState("");

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
            <button key={t} type="button" onClick={() => onSearch(t)}>{t}</button>
          ))}
        </div>
      </div>

      {children}
    </section>
  );
}
