"use client";

// 👥 Mesa de Agentes — la respuesta a la página "Agentes" de FinAnalista.
//
// Allá la página dice "coming soon": siete módulos apagados, sin datos. Aquí
// los ocho agentes son los que de verdad calculan el puntaje de Nagimi, con su
// peso real. Con un ticker, los dos de contexto (Riesgo y Catalizadores) se
// llenan en vivo aquí mismo, porque son baratos de calcular; los seis que
// puntúan necesitan el escaneo completo del flujo y se llenan en el Panel.

import { useEffect, useState } from "react";
import { CATALOGO, SIN_DATOS } from "@/lib/mesaAgentes";
import { useLecturasAgentes } from "../components/useLecturasAgentes";

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

export default function AgentesPage() {
  const [texto, setTexto] = useState("");
  const { ticker, vivos, analizar } = useLecturasAgentes();

  // Si llega ?ticker=XXX (desde el Panel o la tabla), se analiza solo.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t && /^[A-Za-z.]{1,6}$/.test(t.trim())) analizar(t.trim().toUpperCase());
  }, [analizar]);

  const enviar = () => {
    const t = texto.trim().toUpperCase();
    if (t) analizar(t);
  };

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="eyebrow">Mesa de agentes</div>
        <h1>Ocho agentes miran tu ticker. <em>Cada uno vigila algo distinto.</em></h1>
        <p>
          Seis le ponen nota al ticker y esa nota es el puntaje de Nagimi; su peso dice cuánto
          manda cada uno. Los otros dos no puntúan: avisan de un riesgo o de una fecha. Aquí no
          hay ninguno apagado — todos trabajan cada vez que analizas.
        </p>
      </div>

      <div className="home-ask" style={{ alignItems: "stretch", textAlign: "left" }}>
        <div className="home-search" style={{ maxWidth: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
            placeholder="Escribe un ticker para ver qué ven los agentes…"
            aria-label="Ticker"
            spellCheck={false}
          />
          <button type="button" onClick={enviar} aria-label="Ver" title="Ver">→</button>
        </div>
        <div className="home-try" style={{ justifyContent: "flex-start" }}>
          <span>Prueba</span>
          {PRUEBA.map((t) => (
            <button key={t} type="button" onClick={() => analizar(t)}>{t}</button>
          ))}
          {ticker && (
            <a className="rs-chip" href={`/?ticker=${encodeURIComponent(ticker)}`} style={{ marginLeft: 6 }}>
              Análisis completo de {ticker} →
            </a>
          )}
        </div>
      </div>

      <div className="mesa-grid">
        {CATALOGO.map((a) => {
          const vivo = vivos[a.codigo];
          const dato = typeof vivo === "object" ? vivo : null;
          const tono = dato?.tono ?? "none";
          return (
            <div key={a.codigo} className={`mesa-card mesa-${tono}`}>
              <div className="mesa-top">
                <span className="mesa-cod">{a.codigo}</span>
                <span className="mesa-senal">
                  {dato ? dato.senal : vivo === "cargando" ? "leyendo…" : a.mira}
                </span>
              </div>
              <div className="mesa-nombre">
                {a.nombre}{" "}
                <span className="mesa-peso">
                  {a.weight > 0 ? `· pesa ${a.weight}% del puntaje` : "· contexto, no cuenta para el puntaje"}
                </span>
              </div>
              <div className="mesa-quehace">{a.queHace}</div>
              <div className="mesa-viendo">
                <span className="mesa-viendo-lbl">Ahora:</span>{" "}
                {dato ? dato.viendo
                  : vivo === "cargando" ? "leyendo el mercado…"
                  : vivo === "sin dato" ? `sin dato para ${ticker}`
                  : ticker
                    ? <>se llena con el análisis completo — <a href={`/?ticker=${encodeURIComponent(ticker)}`}>ábrelo en el Panel</a></>
                    : "escribe un ticker arriba"}
              </div>
              {dato?.empuje && <div className="mesa-empuje">{dato.empuje}</div>}
            </div>
          );
        })}
      </div>

      {/* Lo que NO está — con el motivo. FinAnalista los deja como cuadros
          apagados que dicen "Pronto"; aquí se dice por qué no. */}
      <div className="card" style={{ gap: 12 }}>
        <div>
          <div className="card-title">Lo que Nagimi todavía no puede mirar</div>
          <div className="card-sub">
            Estos tres los tiene FinAnalista en su lista, apagados. Aquí no se pone una tarjeta vacía:
            se dice qué haría y por qué no está.
          </div>
        </div>
        <div className="pf-grid">
          {SIN_DATOS.map((a) => (
            <div key={a.codigo} className="pf-card pf-off">
              <div className="pf-top">
                <span className="mesa-cod">{a.codigo}</span>
                <span className="pf-nombre">{a.nombre}</span>
              </div>
              <div className="pf-como">{a.queHace}</div>
              <div className="pf-problema">{a.porQueNo}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="disclaimer">
        Los seis agentes con peso necesitan el escaneo completo del flujo, así que su lectura vive
        en el Panel. Riesgo, Catalizadores, Técnicos, Sentimiento y Macro se calculan aquí mismo.
        Material de estudio, no consejo financiero.
      </div>
    </main>
  );
}
