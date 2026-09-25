"use client";

// 🗺️ Mapa GEX — la proyección de un ticker en tres escenarios, lista para
// guardar en PDF.
//
// Es el formato que comparte la comunidad ("PROYECCIÓN QQQ — GEX MAP"): el
// nivel donde se decide el día, qué pasa si sube, si baja o si se queda
// encerrado, el ambiente del mercado y la regla de no perseguir. Nagimi lo
// arma solo para cualquier ticker; el texto sale de lib/mapaGex.ts.

import { useCallback, useEffect, useState } from "react";
import BotonGuardar from "../components/BotonGuardar";
import type { MapaGex, Escenario } from "@/lib/mapaGex";
import { metaTexto } from "@/lib/mapaGex";

interface Resp {
  mapa?: MapaGex;
  fuente?: string;
  asOf?: string;
  flujoLeido?: boolean;
  error?: string;
}

const px = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;

const ESTILO: Record<Escenario["tipo"], { icono: string; color: string }> = {
  alcista: { icono: "🟢", color: "var(--green)" },
  bajista: { icono: "🔴", color: "var(--red-soft)" },
  rango: { icono: "🟡", color: "#f5c451" },
};

const SUGERIDOS = ["SPY", "QQQ", "SPX", "NVDA", "TSLA"];

export default function MapaPage() {
  const [ticker, setTicker] = useState("");
  const [escrito, setEscrito] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async (t: string) => {
    const tk = t.trim().toUpperCase();
    if (!tk) return;
    setTicker(tk);
    setEscrito(tk);
    setCargando(true);
    setData(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", tk);
      window.history.replaceState(null, "", url.toString());
    } catch { /* sin history */ }
    try {
      const r = await fetch(`/api/mapa-gex?ticker=${encodeURIComponent(tk)}`).then((x) => x.json());
      setData(r);
    } catch {
      setData({ error: "No se pudo conectar con Nagimi." });
    }
    setCargando(false);
  }, []);

  // El ticker puede venir en la dirección (/mapa?ticker=QQQ).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t) cargar(t);
  }, [cargar]);

  const m = data?.mapa;
  const hora = data?.asOf
    ? new Date(data.asOf).toLocaleString("es-PR", {
        weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;

  return (
    <main className="wrap page-stack" style={{ maxWidth: 900 }}>
      <div className="home-hero" style={{ marginBottom: 6 }}>
        <div className="home-kicker">Mapa de muros · proyección</div>
        <h1>¿Para dónde puede ir <em>hoy</em>?</h1>
        <p>
          Nagimi busca el precio donde se decide el día y te dice qué buscar si sube, si baja
          o si se queda encerrado. Lo puedes guardar en PDF para tenerlo a mano.
        </p>
      </div>

      <div className="home-search" style={{ margin: "0 auto" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={escrito}
          onChange={(e) => setEscrito(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") cargar(escrito); }}
          placeholder="Escribe un ticker, por ejemplo QQQ…"
          aria-label="Ticker para el mapa"
          spellCheck={false}
        />
        <button type="button" onClick={() => cargar(escrito)} aria-label="Armar mapa">→</button>
      </div>
      <div className="home-try">
        <span>Prueba</span>
        {SUGERIDOS.map((t) => <button key={t} type="button" onClick={() => cargar(t)}>{t}</button>)}
      </div>

      {cargando && <div className="card research-muted">Armando el mapa de {ticker}… (tarda unos segundos)</div>}
      {data?.error && <div className="card" style={{ color: "var(--red-soft)" }}>No se pudo armar el mapa de {ticker}: {data.error}</div>}

      {m && (
        <article className="card mg">
          <div className="mg-head">
            <div>
              <div className="eyebrow">Proyección · mapa de muros</div>
              <div className="mg-titulo">{m.ticker}</div>
              {hora && <div className="card-sub">Datos de {hora} (hora de Nueva York)</div>}
            </div>
            <div className="mg-clave">
              <div className="mg-clave-label">Nivel clave</div>
              <div className="mg-clave-valor">{px(m.nivelClave)}</div>
              <div className="mg-clave-sub">precio ahora {px(m.spot)}</div>
            </div>
          </div>

          <BotonGuardar ticker={`${m.ticker} mapa`} />

          <p className="mg-lectura">{m.lectura}</p>

          <div className="mg-escenarios">
            {m.escenarios.map((e) => (
              <section key={e.tipo} className="mg-esc" style={{ borderLeftColor: ESTILO[e.tipo].color }}>
                <div className="mg-esc-titulo" style={{ color: ESTILO[e.tipo].color }}>
                  {ESTILO[e.tipo].icono} {e.titulo}
                </div>
                <div className="mg-esc-cond">Qué tiene que pasar: {e.condicion}.</div>
                <p className="mg-esc-texto">{e.texto}</p>
                {e.metas.length > 0 && e.tipo !== "rango" && (
                  <div className="mg-metas">
                    {e.metas.map((mt, i) => (
                      <span key={i} className="mg-meta">{i + 1}. {metaTexto(mt)}</span>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {m.ambiente && (
            <section className="mg-bloque">
              <div className="mg-bloque-titulo">📉 El ambiente</div>
              <p>{m.ambiente}</p>
            </section>
          )}

          {m.confirmaciones.length > 0 && (
            <section className="mg-bloque">
              <div className="mg-bloque-titulo">🎯 Qué vigilar</div>
              <ul className="mg-lista">
                {m.confirmaciones.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </section>
          )}

          <section className="mg-bloque mg-regla">
            <div className="mg-bloque-titulo">🔎 La regla</div>
            <p>{m.regla}</p>
          </section>

          <div className="mg-pie">
            Muros leídos de {data?.fuente ?? "—"}.
            {data?.flujoLeido === false && " No se pudo leer hacia dónde va el dinero (falta conectar MarketSnack): los escenarios se basan solo en los muros."}
            {" "}Esto es un mapa para estudiar, no una orden: tú decides y ejecutas.
          </div>
        </article>
      )}
    </main>
  );
}
