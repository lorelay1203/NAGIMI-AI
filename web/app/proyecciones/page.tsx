"use client";

// 📈 Proyecciones — el mapa del ticker, con el mismo formato físico que el
// "projection map" de FinAnalista: barra de arriba con el precio, marcos de
// tiempo, el gráfico grande con niveles y conos, y un panel derecho con la
// lectura, las probabilidades por escenario y el cono en números.
//
// Lo que Nagimi añade y allá no está: de qué fuente salió cada dato, el
// régimen de gamma del día explicado, y decir en voz alta que esta página no
// corre el escaneo de flujo (por eso la confianza sale recortada).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProPrediction } from "@/lib/prediction";
import type { TfBar } from "@/lib/types";
import { porQueEscenario, repartoEscenarios } from "@/lib/escenariosProb";
import ProyeccionMapa, { type NivelMapa } from "../components/ProyeccionMapa";

const PRUEBA = ["SPY", "QQQ", "NVDA", "TSLA"];

const HORIZONTES = [
  { dias: 10, titulo: "10D", nombre: "Táctico", sub: "2 semanas", que: "La presión de los dealers de ahora mismo y los saltos rápidos de gamma." },
  { dias: 20, titulo: "20D", nombre: "Swing", sub: "1 mes", que: "La presión de las opciones alrededor de los vencimientos cercanos." },
  { dias: 30, titulo: "30D", nombre: "Posición", sub: "6 semanas", que: "Presión de plazo más largo y cono de movimiento esperado más ancho." },
];

/** Marcos de tiempo del gráfico (los mismos que ya sirve /api/bars). */
const MARCOS = [
  { id: "5m5d", label: "5D · 5min" },
  { id: "15m10d", label: "10D · 15min" },
  { id: "1y", label: "1 año · diario" },
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
  maxPain: number | null;
  sigmaPct: number;
  cono: { abajo2: number; abajo1: number; arriba1: number; arriba2: number };
  prediction: ProPrediction;
  asOf: string;
  error?: string;
}

const px = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pxCorto = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export default function ProyeccionesPage() {
  const [texto, setTexto] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);
  const [dias, setDias] = useState(20);
  const [marco, setMarco] = useState("15m10d");
  const [data, setData] = useState<Proyeccion | null>(null);
  const [barras, setBarras] = useState<TfBar[] | null>(null);
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

  // Las velas van por su lado: cambiar de marco no vuelve a pedir la proyección.
  useEffect(() => {
    if (!ticker) return;
    let vivo = true;
    setBarras(null);
    fetch(`/api/bars?ticker=${encodeURIComponent(ticker)}&tf=${marco}`)
      .then((r) => r.json())
      .then((r) => { if (vivo) setBarras(Array.isArray(r.bars) ? r.bars : []); })
      .catch(() => { if (vivo) setBarras([]); });
    return () => { vivo = false; };
  }, [ticker, marco]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t && /^[A-Za-z.]{1,6}$/.test(t.trim())) correr(t.trim().toUpperCase(), 20);
  }, [correr]);

  const enviar = () => {
    const t = texto.trim().toUpperCase();
    if (t) correr(t, dias);
  };

  const p = data?.prediction;

  const reparto = useMemo(() => {
    if (!data || !p) return null;
    return repartoEscenarios({
      spot: data.spot, iv: data.iv, dias: data.horizonDays,
      bear: p.bear.target, base: p.base.target, bull: p.bull.target,
    });
  }, [data, p]);

  const niveles: NivelMapa[] = useMemo(() => {
    if (!data) return [];
    const out: NivelMapa[] = [];
    if (data.putWall) out.push({ precio: data.putWall, etiqueta: "Suelo", color: "#3fd07a" });
    if (data.callWall) out.push({ precio: data.callWall, etiqueta: "Techo", color: "#ff6b6b" });
    if (data.magnet) out.push({ precio: data.magnet, etiqueta: "Imán", color: "#8b7cff" });
    if (data.gammaFlip) out.push({ precio: data.gammaFlip, etiqueta: "Cambio de régimen", color: "#b98cff", punteada: true });
    if (data.maxPain) out.push({ precio: data.maxPain, etiqueta: "Max pain", color: "#8a93a6", punteada: true });
    return out;
  }, [data]);

  const ultimaVela = barras && barras.length > 0
    ? new Date(barras[barras.length - 1].time * 1000).toLocaleString("es-PR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="wrap page-stack" style={{ maxWidth: 1320 }}>
      {!data && (
        <div className="page-head">
          <div className="eyebrow">Laboratorio de proyecciones</div>
          <h1>Busca un ticker. <em>Mira hasta dónde puede llegar.</em></h1>
          <p>
            La proyección se arma con la presión de la cadena de opciones: dónde están los muros de
            gamma, cuál es el imán y cuánto puede moverse el precio por volatilidad. En vez de una
            tabla de contratos, te da tres caminos: bajista, base y alcista.
          </p>
        </div>
      )}

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

      {!data && (
        <div className="pf-grid">
          {HORIZONTES.map((h) => (
            <button key={h.dias} type="button" className={`hz-card${dias === h.dias ? " on" : ""}`} onClick={() => setDias(h.dias)}>
              <div className="hz-card-top">{h.titulo}</div>
              <div className="hz-card-nombre">{h.nombre}</div>
              <div className="hz-card-sub">{h.sub}</div>
              <div className="hz-card-que">{h.que}</div>
            </button>
          ))}
        </div>
      )}

      {cargando && <div className="card" style={{ color: "var(--muted)" }}>Armando la proyección de {ticker}…</div>}
      {error && !cargando && <div className="error">⚠ {error}</div>}

      {data && p && !cargando && (
        <>
          {/* Barra de arriba del mapa: ticker, precio, marcos de tiempo y horizonte. */}
          <div className="mapa-barra">
            <div className="mapa-id">
              <div className="eyebrow">Agente de opciones · Nagimi</div>
              <div className="mapa-ticker">
                {data.ticker} <span className="mapa-precio">{px(data.spot)}</span>
                <span className={`mapa-chg ${p.base.changePct >= 0 ? "up" : "down"}`}>{pct(p.base.changePct)} al objetivo</span>
              </div>
              <div className="mapa-sub">
                {ultimaVela ? `Última vela · ${ultimaVela}` : "Cargando velas…"} · fuente{" "}
                {data.fuente === "marketsnack" ? "MarketSnack" : data.fuente === "schwab" ? "Schwab" : "Massive"}
              </div>
            </div>
            <div className="mapa-controles">
              <div className="home-try" style={{ margin: 0 }}>
                {MARCOS.map((m) => (
                  <button key={m.id} type="button" className={marco === m.id ? "on" : ""} onClick={() => setMarco(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="home-try" style={{ margin: 0 }}>
                {HORIZONTES.map((h) => (
                  <button key={h.dias} type="button" className={data.horizonDays === h.dias ? "on" : ""} onClick={() => correr(data.ticker, h.dias)}>
                    {h.titulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mapa-wrap">
            <div className="card" style={{ padding: 14 }}>
              {barras == null
                ? <div className="chart-empty">Cargando velas de {data.ticker}…</div>
                : <ProyeccionMapa
                    ticker={data.ticker}
                    barras={barras}
                    spot={data.spot}
                    iv={data.iv}
                    dias={data.horizonDays}
                    base={p.base.target}
                    niveles={niveles}
                  />}
            </div>

            {/* Panel derecho: lectura, escenarios y cono. */}
            <div className="mapa-rail">
              <div className="card" style={{ gap: 4 }}>
                <div className="eyebrow">Lectura de proyección</div>
                <div className="mapa-lectura">{pxCorto(p.base.target)}</div>
                <div className="mapa-sub">
                  A {data.horizonDays} días según la presión de las opciones · gamma{" "}
                  {data.regimen === "positive" ? "positiva (frena)" : "negativa (acelera)"}
                </div>
              </div>

              <div className="card" style={{ gap: 12 }}>
                <div className="eyebrow">Probabilidades por escenario</div>
                {reparto ? (
                  ([
                    { id: "alcista" as const, txt: "Alcista", valor: reparto.alcista, target: p.bull.target, color: "var(--green)" },
                    { id: "neutral" as const, txt: "Neutral", valor: reparto.neutral, target: p.base.target, color: "var(--muted)" },
                    { id: "bajista" as const, txt: "Bajista", valor: reparto.bajista, target: p.bear.target, color: "var(--red-soft)" },
                  ]).map((e) => {
                    const mayor = e.valor === Math.max(reparto.alcista, reparto.neutral, reparto.bajista);
                    return (
                      <div key={e.id} className="esc-box">
                        <div className="esc-top">
                          <span style={{ color: e.color, fontWeight: 700 }}>{e.txt}</span>
                          <span className="esc-pct" style={{ color: e.color }}>{e.valor}%</span>
                        </div>
                        <div className="esc-bar"><span style={{ width: `${e.valor}%`, background: e.color }} /></div>
                        <div className="esc-target">Zona objetivo {pxCorto(e.target)}</div>
                        <div className="esc-por">{porQueEscenario(e.id === "neutral" ? "neutral" : e.id, data.regimen, mayor)}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="research-muted">No se pudo repartir el peso entre escenarios con estos datos.</div>
                )}
                <div className="mapa-sub">
                  Suman 100%: es dónde puede <b>terminar</b> el precio, no dónde puede tocar.
                </div>
              </div>

              <div className="card" style={{ gap: 8 }}>
                <div className="eyebrow">Cono de movimiento esperado</div>
                <div className="cono-fila">
                  <div className="cono-pill"><span>1σ abajo</span><b>{pxCorto(data.cono.abajo1)}</b></div>
                  <div className="cono-pill on"><span>Base</span><b>{pxCorto(p.base.target)}</b></div>
                  <div className="cono-pill"><span>1σ arriba</span><b>{pxCorto(data.cono.arriba1)}</b></div>
                </div>
                <div className="cono-estres">
                  Rango de estrés 2σ · {pxCorto(data.cono.abajo2)} – {pxCorto(data.cono.arriba2)}
                </div>
                <div className="mapa-sub">
                  Con la volatilidad de hoy ({(data.iv * 100).toFixed(1)}%, {data.ivFuente === "cadena" ? "de la cadena" : "estimada"}),
                  moverse ±{data.sigmaPct.toFixed(1)}% en {data.horizonDays} días es lo normal.
                </div>
              </div>

              <div className="card" style={{ gap: 6 }}>
                <div className="eyebrow">Confianza {p.confidence}%</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
                  Esta página usa solo la cadena de opciones: no corre el escaneo del flujo (quién
                  compra, con cuánta prisa, si es raro). Para la lectura completa con los ocho
                  agentes, abre <a href={`/?ticker=${encodeURIComponent(data.ticker)}`}>{data.ticker} en el Panel</a>.
                </div>
              </div>
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
