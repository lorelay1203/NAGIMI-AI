"use client";

// 📈 Proyecciones — la respuesta a la página "Proyecciones" de FinAnalista.
//
// Mismo formato: buscador, tres horizontes en tarjetas y luego la lectura con
// escenarios. La diferencia es de dónde salen los números: aquí son los muros
// de gamma y el cono de movimiento esperado de Nagimi, no un reporte guardado.
//
// Esta página NO corre el escaneo de flujo (eso vive en el Panel), así que la
// confianza sale recortada y se dice claramente.

import { useCallback, useEffect, useState } from "react";
import type { ProPrediction } from "@/lib/prediction";

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

const HORIZONTES = [
  { dias: 10, titulo: "10D", nombre: "Táctico", sub: "~2 semanas de mercado", que: "La presión de los dealers de ahora mismo y los saltos rápidos de gamma." },
  { dias: 20, titulo: "20D", nombre: "Swing", sub: "~1 mes de mercado", que: "La presión de las opciones alrededor de los vencimientos cercanos." },
  { dias: 30, titulo: "30D", nombre: "Posición", sub: "~6 semanas", que: "Presión de plazo más largo y cono de movimiento esperado más ancho." },
];

interface Proyeccion {
  ticker: string;
  horizonDays: number;
  spot: number;
  iv: number;
  ivFuente: string;
  fuente: string;
  regimen: "positive" | "negative";
  callWall: number | null;
  putWall: number | null;
  magnet: number | null;
  gammaFlip: number | null;
  sigmaPct: number;
  cono: { abajo2: number; abajo1: number; arriba1: number; arriba2: number };
  prediction: ProPrediction;
  asOf: string;
  error?: string;
}

const px = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const prob = (p: number) => `${Math.round(p * 100)}%`;

export default function ProyeccionesPage() {
  const [texto, setTexto] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);
  const [dias, setDias] = useState(20);
  const [data, setData] = useState<Proyeccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const correr = useCallback(async (t: string, d: number) => {
    setTicker(t); setDias(d); setCargando(true); setError(null); setData(null);
    try {
      const r = await fetch(`/api/proyeccion?ticker=${encodeURIComponent(t)}&dias=${d}`).then((x) => x.json());
      if (r.error) setError(r.error);
      else setData(r as Proyeccion);
    } catch {
      setError("No se pudo conectar con Nagimi.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t && /^[A-Za-z.]{1,6}$/.test(t.trim())) correr(t.trim().toUpperCase(), 20);
  }, [correr]);

  const enviar = () => {
    const t = texto.trim().toUpperCase();
    if (t) correr(t, dias);
  };

  const p = data?.prediction;

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="eyebrow">Laboratorio de proyecciones</div>
        <h1>Busca un ticker. <em>Mira hasta dónde puede llegar.</em></h1>
        <p>
          La proyección se arma con la presión de la cadena de opciones: dónde están los muros de
          gamma, cuál es el imán y cuánto puede moverse el precio por volatilidad. En vez de una
          tabla de contratos, te da tres caminos: bajista, base y alcista.
        </p>
      </div>

      <div className="card" style={{ gap: 12 }}>
        <div className="eyebrow">Buscar ticker</div>
        <div className="home-search" style={{ maxWidth: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
            placeholder="Busca una acción o ETF…"
            aria-label="Ticker"
            spellCheck={false}
          />
          <button type="button" onClick={enviar} aria-label="Proyectar" title="Proyectar">→</button>
        </div>
        <div className="home-try" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <span>Prueba</span>
          {PRUEBA.map((t) => <button key={t} type="button" onClick={() => correr(t, dias)}>{t}</button>)}
        </div>
      </div>

      <div className="pf-grid">
        {HORIZONTES.map((h) => (
          <button
            key={h.dias}
            type="button"
            className={`hz-card${dias === h.dias ? " on" : ""}`}
            onClick={() => (ticker ? correr(ticker, h.dias) : setDias(h.dias))}
          >
            <div className="hz-card-top">{h.titulo}</div>
            <div className="hz-card-nombre">{h.nombre}</div>
            <div className="hz-card-sub">{h.sub}</div>
            <div className="hz-card-que">{h.que}</div>
          </button>
        ))}
      </div>

      {cargando && <div className="card" style={{ color: "var(--muted)" }}>Armando la proyección de {ticker}…</div>}
      {error && !cargando && <div className="error">⚠ {error}</div>}

      {data && p && !cargando && (
        <>
          <div className="card" style={{ gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="card-title">{data.ticker} a {data.horizonDays} días</div>
                <div className="card-sub">
                  Precio ahora {px(data.spot)} · se mueve ±{data.sigmaPct.toFixed(1)}% sin que nadie se sorprenda ·
                  gamma {data.regimen === "positive" ? "positiva (tiende a frenar)" : "negativa (tiende a acelerar)"}
                </div>
              </div>
              <a className="rs-chip" href={`/?ticker=${encodeURIComponent(data.ticker)}`}>Análisis completo →</a>
            </div>

            <div className="sc-grid">
              {[p.bear, p.base, p.bull].map((s) => {
                const color = s.kind === "bear" ? "#ff8a82" : s.kind === "bull" ? "#4ad991" : "#c3ccdd";
                const label = s.kind === "bear" ? "Si baja" : s.kind === "bull" ? "Si sube" : "Lo más probable";
                return (
                  <div key={s.kind} className="sc-box" style={{ borderColor: `${color}22` }}>
                    <div className="sc-head" style={{ color }}>{label}</div>
                    <div className="sc-target" style={{ color }}>{px(s.target)}</div>
                    <div className="sc-chg" style={{ color }}>{pct(s.changePct)}</div>
                    <div className="sc-prob">
                      <div className="sc-prob-bar">
                        <div style={{ width: `${Math.round(s.probability * 100)}%`, background: color }} />
                      </div>
                      <span>{prob(s.probability)} de tocarlo</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--text)" }}>Cómo leerlo:</b> el número grande es a dónde puede llegar, y el
              porcentaje de abajo es la probabilidad de que lo <b>toque</b> en algún momento — no de que cierre ahí.
              Entre {px(data.cono.abajo1)} y {px(data.cono.arriba1)} está el movimiento normal;
              salirse de {px(data.cono.abajo2)}–{px(data.cono.arriba2)} sería raro.
            </div>
          </div>

          <div className="card" style={{ gap: 10 }}>
            <div className="card-title">Los niveles que mandan hoy</div>
            <div className="pf-grid">
              <Nivel label="Suelo (muro de puts)" valor={data.putWall} sub="ahí suele frenar la caída" />
              <Nivel label="Imán" valor={data.magnet} sub="donde más pesa la gamma" />
              <Nivel label="Techo (muro de calls)" valor={data.callWall} sub="ahí suele frenar la subida" />
              <Nivel label="Cambio de régimen" valor={data.gammaFlip} sub="arriba frena, abajo acelera" />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--faint)" }}>
              Fuente {data.fuente === "marketsnack" ? "MarketSnack" : data.fuente === "schwab" ? "Schwab" : "Massive"} ·
              volatilidad {(data.iv * 100).toFixed(1)}% ({data.ivFuente === "cadena" ? "de la cadena" : "estimada"}) ·
              {new Date(data.asOf).toLocaleTimeString("es-PR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          <div className="card" style={{ gap: 6 }}>
            <div className="card-title">Confianza recortada a propósito</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              Esta página usa solo la cadena de opciones: no corre el escaneo del flujo (quién compra,
              con cuánta prisa, si es raro). Por eso la confianza sale en {p.confidence}% y no más.
              Para la lectura completa con los ocho agentes, abre{" "}
              <a href={`/?ticker=${encodeURIComponent(data.ticker)}`}>{data.ticker} en el Panel</a>.
            </div>
          </div>
        </>
      )}

      <div className="disclaimer">
        Proyección estimada con datos de opciones, no consejo financiero. El precio puede hacer otra cosa.
      </div>
    </main>
  );
}

function Nivel({ label, valor, sub }: { label: string; valor: number | null; sub: string }) {
  return (
    <div className="pf-card">
      <div className="eyebrow">{label}</div>
      <div className="pf-monto">{valor != null ? px(valor) : "—"}</div>
      <div className="pf-como">{sub}</div>
    </div>
  );
}
