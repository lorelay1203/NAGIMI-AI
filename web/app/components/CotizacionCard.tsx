"use client";

// 💹 Cotización de la sesión — la tarjeta que sale al escribir un ticker.
//
// Es la "COTIZACIÓN EN VIVO" de la página de referencia, con una diferencia que
// importa: los datos de Massive vienen CON RETRASO, así que aquí no se dice
// "en vivo" cuando no lo es. Si el dato está retrasado, se dice y se pone la
// hora de la última vela.
//
// Sirve para decidir antes de gastar 40 segundos en el análisis completo: ves
// el precio, cuánto lleva en el día, el volumen y si está sobre o bajo el VWAP.

import { useEffect, useState } from "react";
import type { DaySession } from "@/lib/sessionDay";
import Termino from "./Termino";

const px = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctTxt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/** "2026-09-24" → "jueves 24 de septiembre" (la fecha es de Nueva York, no se corre de día). */
const fechaHumana = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};

/** 119300000 → "119.30M" (como lo escribe cualquier bróker). */
const compacto = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

function Tile({ label, valor, sub, color }: { label: React.ReactNode; valor: string; sub?: string; color?: string }) {
  return (
    <div className="cot-tile">
      <div className="cot-tile-label">{label}</div>
      <div className="cot-tile-valor" style={color ? { color } : undefined}>{valor}</div>
      {sub && <div className="cot-tile-sub">{sub}</div>}
    </div>
  );
}

export default function CotizacionCard({
  ticker,
  onAnalizar,
  onCerrar,
  analizando = false,
}: {
  ticker: string;
  onAnalizar: (t: string) => void;
  onCerrar?: () => void;
  /** Mientras corre el análisis completo, el botón se apaga y lo dice. */
  analizando?: boolean;
}) {
  const [s, setS] = useState<DaySession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setS(null); setError(null);
    const ctl = new AbortController();
    const tope = setTimeout(() => ctl.abort(), 30_000);
    fetch(`/api/session-day?ticker=${encodeURIComponent(ticker)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { session?: DaySession; error?: string }) => {
        if (!vivo) return;
        if (d.session) setS(d.session);
        else setError(d.error ?? "sin datos de ese ticker");
      })
      .catch(() => { if (vivo) setError("no se pudo leer la cotización"); })
      .finally(() => clearTimeout(tope));
    return () => { vivo = false; ctl.abort(); };
  }, [ticker]);

  const delta = s && s.prevClose != null && s.prevClose > 0
    ? ((s.price - s.prevClose) / s.prevClose) * 100
    : null;
  const colorDelta = delta == null ? "var(--muted)" : delta >= 0 ? "var(--green)" : "var(--red-soft)";
  const sobreVwap = s?.vwap != null ? s.price >= s.vwap : null;

  return (
    <section className="card cot">
      <div className="cot-head">
        <div>
          <div className="eyebrow">
            {s?.delayed === false ? "Cotización en vivo" : "Cotización de la sesión"}
          </div>
          <div className="cot-ticker">{ticker}</div>
        </div>
        {onCerrar && (
          <button type="button" className="cot-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        )}
      </div>

      {error && <div className="research-muted">No se pudo leer {ticker}: {error}.</div>}
      {!s && !error && <div className="research-muted">Leyendo la sesión de {ticker}…</div>}

      {s && (
        <>
          <div className="cot-precio-fila">
            <div className="cot-precio">{px(s.price)}</div>
            <div className="cot-delta" style={{ color: colorDelta }}>
              {delta == null ? "—" : pctTxt(delta)}
            </div>
            <button
              type="button"
              className="cot-analizar"
              onClick={() => onAnalizar(ticker)}
              disabled={analizando}
            >
              {analizando ? "Analizando…" : "⚡ Ejecutar análisis completo"}
            </button>
          </div>

          <div className="cot-tiles">
            <Tile
              label={<Termino t="Volumen" soloSimple />}
              valor={s.volume != null ? compacto(s.volume) : "—"}
              sub="cuántas cambiaron de mano hoy"
            />
            <Tile
              label={<Termino t="VWAP" />}
              valor={s.vwap != null ? px(s.vwap) : "—"}
              sub={sobreVwap == null ? "sin dato" : sobreVwap ? "el precio va por encima" : "el precio va por debajo"}
              color={sobreVwap == null ? undefined : sobreVwap ? "var(--green)" : "var(--red-soft)"}
            />
            <Tile label="Lo más alto" valor={s.dayHigh != null ? px(s.dayHigh) : "—"} sub="que llegó hoy" />
            <Tile label="Lo más bajo" valor={s.dayLow != null ? px(s.dayLow) : "—"} sub="que llegó hoy" />
          </div>

          <div className="cot-pie">
            {s.delayed
              ? `⏱ Datos con retraso: es la sesión del ${fechaHumana(s.sessionDate)}, no el precio de este mismo segundo.`
              : `Sesión del ${fechaHumana(s.sessionDate)}.`}
            {" "}El análisis completo tarda ~40 s y trae veredicto, niveles y los ocho agentes.
          </div>
        </>
      )}
    </section>
  );
}
