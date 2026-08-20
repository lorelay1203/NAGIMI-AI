"use client";

import { useState } from "react";

type HomeHubProps = {
  onSearch: (ticker: string) => void;
};

const LINKS = {
  opportunities: [
    { href: "/daytrades", label: "Day Trades" },
    { href: "/ideas", label: "Ideas" },
    { href: "/watchlist", label: "Watchlist" },
  ],
  strategies: [
    { href: "#strategy-tools", label: "Buscar por capital" },
    { href: "/wheel", label: "Wheel" },
  ],
  practice: [
    { href: "#practice-tools", label: "Paper Trading" },
    { href: "#practice-tools", label: "Historial y diario" },
  ],
};

export default function HomeHub({ onSearch }: HomeHubProps) {
  const [ticker, setTicker] = useState("");

  const submit = () => {
    const value = ticker.trim().toUpperCase();
    if (!value) return;
    onSearch(value);
  };

  return (
    <section className="home-hub" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-kicker">NAGIMI AI</div>
        <h1 id="home-title">¿Qué quieres hacer hoy?</h1>
        <p>
          Empieza por una sola tarea. Nagimi organiza el análisis y deja el detalle
          avanzado disponible cuando lo necesites.
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
