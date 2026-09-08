"use client";

// "Tu investigación" — la tabla que abre el panel.
//
// Es la respuesta a la tabla de FinAnalista, con dos diferencias a propósito:
//  · Los tickers son LOS TUYOS (los de tu watchlist), no una lista de ejemplo.
//  · Los números son de la sesión de hoy, no la foto de un reporte viejo:
//    señal, puntaje, precio, cambio del día y los muros de gamma.
// Si un ticker no se puede leer, sale dicho en su fila — nunca un $0 fingido.

import { useCallback, useEffect, useState } from "react";
import { loadEntries } from "@/lib/watchlistLocal";
import type { DaySession } from "@/lib/sessionDay";

/** Si aún no ha marcado nada, se arranca con los tres índices que ella mira. */
const POR_DEFECTO = ["SPY", "QQQ", "NVDA"];
const MAX = 6;

interface Fila {
  ticker: string;
  session: DaySession | null;
  error: string | null;
}

const px = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctTxt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const SEÑAL: Record<string, { txt: string; color: string; icon: string }> = {
  alcista: { txt: "Alcista", color: "var(--green)", icon: "▲" },
  bajista: { txt: "Bajista", color: "var(--red-soft)", icon: "▼" },
  neutral: { txt: "Neutral", color: "var(--muted)", icon: "–" },
};

export default function TuInvestigacionCard({ onPick }: { onPick: (ticker: string) => void }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [propios, setPropios] = useState(false);

  const cargar = useCallback(async (tickers: string[]) => {
    setFilas(tickers.map((t) => ({ ticker: t, session: null, error: null })));
    const pedir = async (ticker: string): Promise<DaySession | null> => {
      const r = await fetch(`/api/session-day?ticker=${encodeURIComponent(ticker)}`).then((x) => x.json());
      return (r.session as DaySession) ?? null;
    };

    const res = await Promise.all(
      tickers.map(async (ticker): Promise<Fila> => {
        try {
          let s = await pedir(ticker);
          // MarketSnack a veces devuelve la sesión sin las barras del día: hay
          // precio y muros, pero no el cierre anterior, y la columna "Δ hoy"
          // sale vacía. Un segundo intento suele traerla completa — el mismo
          // patrón que ya usamos en el ticket de contrato.
          if (s && s.prevClose == null) s = (await pedir(ticker)) ?? s;
          if (s) return { ticker, session: s, error: null };
          return { ticker, session: null, error: "sin datos hoy" };
        } catch {
          return { ticker, session: null, error: "no se pudo leer" };
        }
      }),
    );
    setFilas(res);
  }, []);

  useEffect(() => {
    const guardados = [...new Set(loadEntries().map((e) => e.ticker))].slice(0, MAX);
    setPropios(guardados.length > 0);
    cargar(guardados.length > 0 ? guardados : POR_DEFECTO);
  }, [cargar]);

  if (!filas || filas.length === 0) return null;

  const listos = filas.filter((f) => f.session).length;

  return (
    <section className="card research">
      <div className="research-head">
        <div>
          <div className="research-title">
            Tu <em>investigación</em>
          </div>
          <div className="card-sub">
            {propios
              ? `${filas.length} de tu watchlist · señal y muros de la sesión de hoy`
              : `Todavía no has marcado ninguno — estos son los que suele mirar todo el mundo`}
          </div>
        </div>
        <a href="/watchlist" className="research-all">Ver watchlist →</a>
      </div>

      <div className="research-scroll">
        <table className="research-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Señal</th>
              <th className="num">Puntaje</th>
              <th className="num">Precio</th>
              <th className="num">Δ hoy</th>
              <th className="num">Suelo</th>
              <th className="num">Techo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const s = f.session;
              if (!s) {
                return (
                  <tr key={f.ticker}>
                    <td className="tk">{f.ticker}</td>
                    <td colSpan={6} className="research-muted">
                      {f.error ?? "cargando…"}
                    </td>
                    <td />
                  </tr>
                );
              }
              const sig = SEÑAL[s.bias] ?? SEÑAL.neutral;
              const delta =
                s.prevClose != null && s.prevClose > 0 ? ((s.price - s.prevClose) / s.prevClose) * 100 : null;
              return (
                <tr key={f.ticker} onClick={() => onPick(f.ticker)} className="research-row">
                  <td className="tk">{f.ticker}</td>
                  <td style={{ color: sig.color, fontWeight: 700 }}>
                    {sig.icon} {sig.txt}
                  </td>
                  <td className="num">{s.score.toFixed(1)}<span className="research-den">/10</span></td>
                  <td className="num">{px(s.price)}</td>
                  <td className="num" style={{ color: delta == null ? "var(--muted)" : delta >= 0 ? "var(--green)" : "var(--red-soft)" }}>
                    {delta == null ? "—" : pctTxt(delta)}
                  </td>
                  <td className="num">{s.putWall != null ? px(s.putWall) : "—"}</td>
                  <td className="num">{s.callWall != null ? px(s.callWall) : "—"}</td>
                  <td className="num research-go">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="research-foot">
        {listos < filas.length
          ? `Leyendo ${filas.length - listos} de ${filas.length}…`
          : "Suelo = muro de puts (ahí suele frenar la caída). Techo = muro de calls (ahí suele frenar la subida). Toca una fila para el análisis completo."}
      </div>
    </section>
  );
}
