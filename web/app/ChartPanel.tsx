"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyBar, Row } from "@/lib/types";
import {
  RANGOS,
  RANGO_POR_DEFECTO,
  avisoRecorte,
  esRangoId,
  recortarRango,
  type RangoId,
} from "@/lib/rangoGrafica";

const LINE_COLORS = ["#4da3ff", "#3fd07a", "#ffb020", "#ff6b6b", "#b98cff"];

// Dónde se guarda el rango escogido. Mismo prefijo "nagimi." que el resto.
const CLAVE_RANGO = "nagimi.rangoGrafica";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const px = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function contractLabel(r: Row): string {
  return `${r.contractType === "call" ? "C" : "P"} ${px.format(r.strike)}`;
}

/** Etiqueta completa sobre la línea del strike: contrato · expiración · open premium · notional. */
function lineTitle(r: Row, rank: number): string {
  const op = r.openPremium != null ? money.format(r.openPremium) : "n/a";
  return `#${rank} ${contractLabel(r)} · exp ${r.expiration} · OP ${op} · Not ${money.format(r.notionalValue)}`;
}

export default function ChartPanel({
  ticker,
  bars,
  contracts,
}: {
  ticker: string;
  bars: DailyBar[];
  contracts: Row[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // El rango arranca en el de por defecto y no en lo guardado, porque el
  // servidor no puede leer localStorage: si pintáramos distinto en el primer
  // render, React se quejaría de que no cuadra. Se corrige en el efecto.
  const [rango, setRango] = useState<RangoId>(RANGO_POR_DEFECTO);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE_RANGO);
      if (esRangoId(v)) setRango(v);
    } catch { /* sin almacenamiento: se queda con el de por defecto */ }
  }, []);

  const elegir = (id: RangoId) => {
    setRango(id);
    try { localStorage.setItem(CLAVE_RANGO, id); } catch { /* no pasa nada */ }
  };

  // Las velas del año entero ya vienen de page.tsx: cambiar de rango solo
  // recorta lo que ya está aquí, nunca le pide nada al servidor.
  const recorte = useMemo(() => recortarRango(bars, rango), [bars, rango]);
  const velas = recorte.barras;
  const aviso = avisoRecorte(recorte);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || velas.length === 0) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const { createChart, ColorType, LineStyle, CrosshairMode } = await import(
        "lightweight-charts"
      );
      if (disposed || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8a93a6",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
        grid: {
          vertLines: { color: "#26304230" },
          horzLines: { color: "#26304230" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#26304260" },
        timeScale: { borderColor: "#26304260", timeVisible: false },
        height: 380,
        autoSize: true,
      });

      const series = chart.addCandlestickSeries({
        upColor: "#3fd07a",
        downColor: "#ff6b6b",
        wickUpColor: "#3fd07a",
        wickDownColor: "#ff6b6b",
        borderVisible: false,
      });
      series.setData(velas);

      contracts.forEach((c, i) => {
        series.createPriceLine({
          price: c.strike,
          color: LINE_COLORS[i % LINE_COLORS.length],
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: lineTitle(c, i + 1),
        });
      });

      // fitContent con la serie ya recortada: el rango escogido llena el ancho.
      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // Se rehace el gráfico al cambiar de rango en vez de solo reemplazar la
    // serie: es lo mismo que ya hacía al cambiar de ticker, y así el eje de
    // tiempo y el zoom quedan limpios en vez de heredar el rango anterior.
  }, [ticker, velas, contracts]);

  return (
    <section className="chart">
      <div className="chart-head">
        <h2>Top 5 por Notional Value · {ticker}</h2>
        <div className="tf-toggle" role="group" aria-label="Cuánto histórico se ve">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`tf-btn ${r.id === rango ? "on" : ""}`}
              aria-pressed={r.id === rango}
              title={r.ayuda}
              onClick={() => elegir(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-sub muted">
        Líneas dibujadas en cada strike sobre el precio del subyacente.
        {" "}Los botones de arriba cambian cuánto tiempo se ve: 1M es el último mes, 1A el último año.
      </div>

      {velas.length === 0 ? (
        <div className="chart-empty">Sin histórico de precio para {ticker}.</div>
      ) : (
        <>
          <div ref={containerRef} className="chart-canvas" />
          {/* Si el ticker no llega al rango pedido se dice, no se disimula. */}
          {aviso && <div className="chart-sub muted">{aviso}</div>}
        </>
      )}

      <div className="legend">
        {contracts.map((c, i) => (
          <div key={c.optionTicker || i} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <div className="legend-body">
              <div className="legend-title">
                #{i + 1} · {contractLabel(c)}
                <span className={`pill ${c.contractType}`}>{c.contractType}</span>
              </div>
              <div className="legend-meta">
                Vence {c.expiration} · OI {c.openInterest.toLocaleString("en-US")} ·
                {" "}Dinero parado ahí {c.openPremium != null ? money.format(c.openPremium) : "n/a"} ·
                {" "}Notional <b>{money.format(c.notionalValue)}</b>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
