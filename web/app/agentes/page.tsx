"use client";

// 👥 Mesa de Agentes — la respuesta a la página "Agentes" de FinAnalista.
//
// Allá la página dice "coming soon": siete módulos apagados, sin datos. Aquí
// los ocho agentes son los que de verdad calculan el puntaje de Nagimi, con su
// peso real. Con un ticker, los dos de contexto (Riesgo y Catalizadores) se
// llenan en vivo aquí mismo, porque son baratos de calcular; los seis que
// puntúan necesitan el escaneo completo del flujo y se llenan en el Panel.

import { useCallback, useEffect, useState } from "react";
import { CATALOGO, SIN_DATOS } from "@/lib/mesaAgentes";
import { gammaSkew } from "@/lib/gammaSkew";
import type { Catalizador } from "@/lib/catalizador";

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

interface Vivo {
  /** Lo que ve el agente ahora, por código. */
  viendo: string;
  empuje: string | null;
  senal: string;
  tono: "up" | "down" | "neutral";
}

export default function AgentesPage() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [vivos, setVivos] = useState<Record<string, Vivo | "cargando" | "sin dato">>({});

  const analizar = useCallback(async (t: string) => {
    setTicker(t);
    setVivos({ RSK: "cargando", CAT: "cargando", TCH: "cargando", SNT: "cargando", MAC: "cargando" });

    // Técnicos, Sentimiento y Macro: los tres vienen de la misma ruta.
    fetch(`/api/agentes?ticker=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d: { tecnico: Vivo | null; sentimiento: Vivo | null; macro: Vivo | null }) => {
        setVivos((v) => ({
          ...v,
          TCH: d.tecnico ?? "sin dato",
          SNT: d.sentimiento ?? "sin dato",
          MAC: d.macro ?? "sin dato",
        }));
      })
      .catch(() => setVivos((v) => ({ ...v, TCH: "sin dato", SNT: "sin dato", MAC: "sin dato" })));

    // Catalizadores: fecha real del próximo reporte.
    fetch(`/api/catalizador?ticker=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d: { catalizador: Catalizador | null }) => {
        const c = d.catalizador;
        setVivos((v) => ({
          ...v,
          CAT: c
            ? { viendo: c.viendo, empuje: c.aviso, senal: c.senal, tono: c.tono }
            : "sin dato",
        }));
      })
      .catch(() => setVivos((v) => ({ ...v, CAT: "sin dato" })));

    // Riesgo: la asimetría de la gamma, con los strikes y el flip del día.
    try {
      const [cadena, dia] = await Promise.all([
        fetch(`/api/mschain?ticker=${encodeURIComponent(t)}`).then((r) => r.json()),
        fetch(`/api/daygex?ticker=${encodeURIComponent(t)}`).then((r) => r.json()),
      ]);
      // El perfil por strike sale de los niveles del día cuando la fuente lo da
      // (Schwab o Massive); si la fuente fue MarketSnack, viene vacío y se usa
      // la cadena por strike que se pidió aparte.
      const barras = Array.isArray(dia?.levels?.bars) ? dia.levels.bars : [];
      const strikes = barras.length > 0 ? barras : (Array.isArray(cadena?.strikes) ? cadena.strikes : []);
      const spot = dia?.levels?.spot ?? cadena?.spot ?? 0;
      if (strikes.length === 0 || !(spot > 0)) {
        setVivos((v) => ({ ...v, RSK: "sin dato" }));
      } else {
        const sk = gammaSkew(
          strikes.map((s: { strike: number; netGex: number }) => ({ strike: s.strike, netGex: s.netGex })),
          spot,
          dia?.levels?.gammaFlip ?? null,
        );
        const viendo = sk.ladoEngrasado === "abajo" ? "más gamma que acelera por debajo del precio"
          : sk.ladoEngrasado === "arriba" ? "más gamma que acelera por encima del precio"
          : "gamma pareja a ambos lados";
        setVivos((v) => ({
          ...v,
          RSK: {
            viendo,
            empuje: sk.lectura,
            senal: sk.ladoEngrasado === "abajo" ? "Resbala ABAJO"
              : sk.ladoEngrasado === "arriba" ? "Resbala ARRIBA" : "Parejo",
            tono: sk.ladoEngrasado === "abajo" ? "down" : sk.ladoEngrasado === "arriba" ? "up" : "neutral",
          },
        }));
      }
    } catch {
      setVivos((v) => ({ ...v, RSK: "sin dato" }));
    }
  }, []);

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
