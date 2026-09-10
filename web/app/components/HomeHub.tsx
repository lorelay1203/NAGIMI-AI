"use client";

import { useState } from "react";

type HomeHubProps = {
  onSearch: (ticker: string) => void;
  /** Va entre el titular y las tarjetas de caminos — ahí vive "Tu investigación". */
  children?: React.ReactNode;
};

const LINKS = {
  opportunities: [
    { href: "/daytrades", label: "Day Trades" },
    { href: "/flow", label: "Flujo" },
    { href: "/grandes", label: "🐋 Sigue a los grandes" },
    { href: "/ideas", label: "Ideas" },
  ],
  strategies: [
    { href: "#strategy-tools", label: "Buscar por capital" },
    { href: "/wheel", label: "Wheel" },
    { href: "/prima", label: "Venta de Prima" },
  ],
  practice: [
    { href: "#practice-tools", label: "Paper Trading" },
    { href: "#practice-tools", label: "Historial y diario" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/reportes", label: "Reportes" },
  ],
};

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
        <div className="home-search-row">
          <input
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
            placeholder="Escribe un ticker, por ejemplo SPY"
            aria-label="Ticker para analizar"
            spellCheck={false}
          />
          <button type="button" onClick={submit}>Analizar ticker</button>
        </div>
      </div>

      {children}

      <div className="home-paths">
        <article className="home-path home-path-primary">
          <span className="home-path-icon">01</span>
          <div>
            <h2>Analizar un ticker</h2>
            <p>Veredicto, dirección, confianza, niveles GEX y estrategia posible.</p>
          </div>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".home-search-row input")?.focus()}>
            Comenzar
          </button>
        </article>

        <article className="home-path">
          <span className="home-path-icon">02</span>
          <div>
            <h2>Buscar oportunidades</h2>
            <p>Revisa el mercado, las ideas del día y los contratos que estás siguiendo.</p>
          </div>
          <div className="home-path-links">
            {LINKS.opportunities.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </div>
        </article>

        <article className="home-path">
          <span className="home-path-icon">03</span>
          <div>
            <h2>Elegir estrategia</h2>
            <p>Compara qué estrategia cabe en tu capital y cuánto riesgo representa.</p>
          </div>
          <div className="home-path-links">
            {LINKS.strategies.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </div>
        </article>

        <article className="home-path">
          <span className="home-path-icon">04</span>
          <div>
            <h2>Practicar y revisar</h2>
            <p>Registra ideas sin dinero real y aprende de tus operaciones anteriores.</p>
          </div>
          <div className="home-path-links">
            {LINKS.practice.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
          </div>
        </article>
      </div>

      <div className="home-utility-link">
        <a href="#connections-tools">Conexiones y configuración</a>
      </div>
    </section>
  );
}
