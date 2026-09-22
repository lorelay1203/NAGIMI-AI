"use client";

// "Tu investigación" — la tabla que abre el panel, con el mismo formato que la
// de FinAnalista: logo y nombre, señal, tendencia de 1 año, precio, cambio del
// día, una barra de rango con el precio marcado y el puntaje con su barrita.
//
// Dos diferencias a propósito:
//  · Los tickers son LOS TUYOS (los de tu watchlist), no una lista de ejemplo.
//  · La barra no es bajista/base/alcista de un reporte viejo: es el canal de
//    gamma de HOY — suelo (muro de puts) → techo (muro de calls), con el imán
//    marcado y un punto donde está el precio (ver lib/rangoCanal.ts).
// Si un dato no llega, la celda lo dice — nunca un $0 fingido, y nunca un
// "cargando…" eterno: la sesión tiene tope de tiempo y botón de reintentar.

import { useCallback, useEffect, useState } from "react";
import { loadEntries } from "@/lib/watchlistLocal";
import type { DaySession } from "@/lib/sessionDay";
import { rangoCanal } from "@/lib/rangoCanal";

/** Si aún no ha marcado nada, se arranca con los que ella mira. */
const POR_DEFECTO = ["SPY", "QQQ", "NVDA"];
const MAX = 6;
/** Más que esto esperando la sesión y se ofrece reintentar. */
const TOPE_MS = 40_000;

interface Fila {
  ticker: string;
  session: DaySession | null;
  error: string | null;
  /** Cierres del último año para la minigráfica. null = todavía cargando. */
  cierres: number[] | null;
  nombre: string | null;
}

const px = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Los muros suelen ser strikes redondos: sin decimales si no hacen falta. */
const nivel = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : px(n));
const pctTxt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const SEÑAL: Record<string, { txt: string; cls: string; icon: string }> = {
  alcista: { txt: "Alcista", cls: "up", icon: "▲" },
  bajista: { txt: "Bajista", cls: "down", icon: "▼" },
  neutral: { txt: "Neutral", cls: "flat", icon: "–" },
};

/**
 * Logo con iniciales de respaldo. Se prueba la imagen ANTES de pintarla: si se
 * pinta directo, un 404 que llega antes de que React escuche deja un cuadro
 * blanco vacío (pasaba con SPY y QQQ, que no tienen logo).
 */
function Logo({ ticker }: { ticker: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const url = `/api/logo?ticker=${encodeURIComponent(ticker)}`;
    const img = new Image();
    img.onload = () => { if (vivo && img.naturalWidth > 0) setSrc(url); };
    img.src = url;
    return () => { vivo = false; };
  }, [ticker]);
  return (
    <span className="rs-logo" aria-hidden="true">
      {src ? <img src={src} alt="" /> : ticker.slice(0, 4)}
    </span>
  );
}

function MiniTendencia({ cierres }: { cierres: number[] | null }) {
  if (cierres == null) return <span className="research-muted">…</span>;
  if (cierres.length < 2) return <span className="research-muted">—</span>;
  const W = 84, H = 26;
  const min = Math.min(...cierres);
  const max = Math.max(...cierres);
  const alto = max - min || 1;
  const puntos = cierres.map((c, i) => [
    (i / (cierres.length - 1)) * W,
    H - 2 - ((c - min) / alto) * (H - 4),
  ]);
  const linea = puntos.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const cambio = ((cierres[cierres.length - 1] - cierres[0]) / cierres[0]) * 100;
  const color = cambio >= 0 ? "var(--green)" : "var(--red-soft)";
  const etiqueta = `Último año: ${pctTxt(cambio)}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={etiqueta}>
      <title>{etiqueta}</title>
      <path d={`${linea} L${W},${H} L0,${H} Z`} fill={color} opacity={0.12} />
      <path d={linea} fill="none" stroke={color} strokeWidth={1.3} />
    </svg>
  );
}

function BarraCanal({ s }: { s: DaySession }) {
  const r = rangoCanal(s.price, s.putWall, s.callWall, s.magnet);
  if (!r) return <span className="research-muted">sin muros hoy</span>;
  // Si el imán cae justo en el suelo o el techo, se dice una sola vez.
  const imanAparte = r.iman != null && r.iman !== r.suelo && r.iman !== r.techo;
  const titulo =
    `Suelo ${nivel(r.suelo)} · ${r.iman != null ? `imán ${nivel(r.iman)} · ` : ""}techo ${nivel(r.techo)} · precio ${px(s.price)}`;
  return (
    <div className="rs-range" title={titulo} aria-label={titulo}>
      <div className="rs-bar">
        {r.imanPct != null && <span className="rs-iman" style={{ left: `${r.imanPct}%` }} />}
        <span className={`rs-dot${r.fuera ? " fuera" : ""}`} style={{ left: `${r.precioPct}%` }} />
      </div>
      <div className="rs-labels">
        <span className={r.iman === r.suelo ? "rs-lbl-iman" : undefined}>{nivel(r.suelo)}</span>
        {imanAparte && <span className="rs-lbl-iman">imán {nivel(r.iman as number)}</span>}
        <span className={r.iman === r.techo ? "rs-lbl-iman" : undefined}>{nivel(r.techo)}</span>
      </div>
      {r.fuera && <div className="rs-fuera">{r.fuera === "arriba" ? "por encima del techo" : "por debajo del suelo"}</div>}
    </div>
  );
}

export default function TuInvestigacionCard({ onPick }: { onPick: (ticker: string) => void }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [propios, setPropios] = useState(false);

  const poner = useCallback((ticker: string, cambios: Partial<Fila>) => {
    setFilas((prev) => prev?.map((f) => (f.ticker === ticker ? { ...f, ...cambios } : f)) ?? prev);
  }, []);

  /** La sesión del día, con tope de tiempo: nunca un "cargando…" eterno. */
  const cargarSesion = useCallback(async (ticker: string) => {
    poner(ticker, { session: null, error: null });
    const pedir = async (): Promise<DaySession | null> => {
      const ctl = new AbortController();
      const tope = setTimeout(() => ctl.abort(), TOPE_MS);
      try {
        const r = await fetch(`/api/session-day?ticker=${encodeURIComponent(ticker)}`, { signal: ctl.signal })
          .then((x) => x.json());
        return (r.session as DaySession) ?? null;
      } finally {
        clearTimeout(tope);
      }
    };
    try {
      let s = await pedir();
      // A veces la sesión llega sin el cierre anterior (la columna "Δ hoy"
      // sale vacía). Un segundo intento suele traerla completa.
      if (s && s.prevClose == null) s = (await pedir().catch(() => null)) ?? s;
      poner(ticker, s ? { session: s, error: null } : { error: "sin datos hoy" });
    } catch (e) {
      const tardo = e instanceof DOMException && e.name === "AbortError";
      poner(ticker, { error: tardo ? "tardó demasiado" : "no se pudo leer" });
    }
  }, [poner]);

  const cargar = useCallback((tickers: string[]) => {
    setFilas(tickers.map((t) => ({ ticker: t, session: null, error: null, cierres: null, nombre: null })));
    for (const ticker of tickers) {
      // Cada dato llega por su lado y se pinta apenas llega: la fila no espera
      // a la más lenta.
      cargarSesion(ticker);

      fetch(`/api/history?ticker=${encodeURIComponent(ticker)}`)
        .then((r) => r.json())
        .then((h) => poner(ticker, {
          cierres: Array.isArray(h.bars) ? (h.bars as { close: number }[]).map((b) => b.close) : [],
        }))
        .catch(() => poner(ticker, { cierres: [] }));

      fetch(`/api/nombre?ticker=${encodeURIComponent(ticker)}`)
        .then((r) => r.json())
        .then((n) => poner(ticker, { nombre: typeof n.name === "string" ? n.name : null }))
        .catch(() => {});
    }
  }, [cargarSesion, poner]);

  useEffect(() => {
    const guardados = [...new Set(loadEntries().map((e) => e.ticker))].slice(0, MAX);
    setPropios(guardados.length > 0);
    cargar(guardados.length > 0 ? guardados : POR_DEFECTO);
  }, [cargar]);

  if (!filas || filas.length === 0) return null;

  const listos = filas.filter((f) => f.session || f.error).length;

  return (
    <section className="card research">
      <div className="research-head">
        <div>
          <div className="research-title">
            Tu <em>investigación</em>
          </div>
          <div className="card-sub">
            {propios
              ? `${filas.length} de tu watchlist · señal y canal de gamma de la sesión de hoy`
              : "Todavía no has marcado ninguno — estos son los que suele mirar todo el mundo"}
          </div>
        </div>
        <a href="/watchlist" className="research-all">Ver todo →</a>
      </div>

      <div className="research-scroll">
        <table className="research-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Señal</th>
              <th>1 año</th>
              <th className="num">Precio</th>
              <th className="num">Δ hoy</th>
              <th className="num">Suelo · Imán · Techo</th>
              <th className="num">Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const s = f.session;
              const celdaTicker = (
                <td>
                  <div className="rs-tk">
                    <Logo ticker={f.ticker} />
                    <div>
                      <div className="rs-sym">
                        {f.ticker}
                        <a
                          className="rs-chip"
                          href={`/daytrades?ticker=${encodeURIComponent(f.ticker)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Abrir la sesión de hoy de ${f.ticker} en Day Trades`}
                        >
                          Day trade
                        </a>
                      </div>
                      {f.nombre && <div className="rs-name">{f.nombre}</div>}
                    </div>
                  </div>
                </td>
              );

              if (!s) {
                return (
                  <tr key={f.ticker}>
                    {celdaTicker}
                    <td colSpan={6} className="research-muted">
                      {f.error == null ? "cargando…" : (
                        <>
                          {f.error} ·{" "}
                          <button type="button" className="rs-retry" onClick={() => cargarSesion(f.ticker)}>
                            reintentar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              }

              const sig = SEÑAL[s.bias] ?? SEÑAL.neutral;
              const delta = s.prevClose != null && s.prevClose > 0
                ? ((s.price - s.prevClose) / s.prevClose) * 100
                : null;
              const puntaje = Math.round(Math.min(10, Math.max(0, s.score)) * 10);

              return (
                <tr key={f.ticker} onClick={() => onPick(f.ticker)} className="research-row">
                  {celdaTicker}
                  <td><span className={`sig-pill ${sig.cls}`}>{sig.icon} {sig.txt}</span></td>
                  <td><MiniTendencia cierres={f.cierres} /></td>
                  <td className="num">{px(s.price)}</td>
                  <td
                    className="num"
                    style={{ color: delta == null ? "var(--muted)" : delta >= 0 ? "var(--green)" : "var(--red-soft)" }}
                  >
                    {delta == null ? "—" : pctTxt(delta)}
                  </td>
                  <td className="num"><BarraCanal s={s} /></td>
                  <td className="num">
                    <span className="rs-score" title={`Puntaje de la sesión: ${s.score.toFixed(1)} de 10`}>
                      {puntaje}
                      <span className="rs-score-bar"><span style={{ width: `${puntaje}%` }} /></span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="research-foot">
        {listos < filas.length
          ? `Leyendo ${filas.length - listos} de ${filas.length}…`
          : "La barra va del suelo (muro de puts, donde suele frenar la caída) al techo (muro de calls, donde suele frenar la subida). El punto es el precio de ahora y la rayita dorada, el imán. Toca una fila para el análisis completo."}
      </div>
    </section>
  );
}
