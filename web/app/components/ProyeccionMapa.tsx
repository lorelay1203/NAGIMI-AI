"use client";

// 🗺️ Mapa de proyección — el gráfico grande de la página de Proyecciones.
//
// Es la parte "física" de la página de FinAnalista: velas del precio, los
// niveles dibujados encima, y los dos conos hacia adelante (dorado = 1σ, el
// movimiento normal; azul = 2σ, el rango de estrés). Debajo, la leyenda con
// lo que significa cada línea.
//
// El cono se dibuja con la misma matemática del resto de Nagimi (conePoints de
// expectedMove.ts), extendiendo el eje del tiempo con la misma separación que
// traen las velas.

import { useEffect, useRef } from "react";
import { conePoints } from "@/lib/expectedMove";
import type { TfBar } from "@/lib/types";

export interface NivelMapa {
  precio: number;
  etiqueta: string;
  color: string;
  /** Punteada para los niveles "blandos" (flip, max pain). */
  punteada?: boolean;
}

export default function ProyeccionMapa({
  ticker,
  barras,
  spot,
  iv,
  dias,
  base,
  niveles,
  alto = 460,
}: {
  ticker: string;
  barras: TfBar[];
  spot: number;
  iv: number;
  dias: number;
  /** Objetivo del escenario base: hacia ahí va la línea de trayectoria. */
  base: number;
  niveles: NivelMapa[];
  alto?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || barras.length < 2) return;

    let muerto = false;
    let limpiar = () => {};

    (async () => {
      const { createChart, ColorType, LineStyle, CrosshairMode } = await import("lightweight-charts");
      if (muerto || !ref.current) return;

      const chart = createChart(ref.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8a93a6",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
        grid: { vertLines: { color: "#26304228" }, horzLines: { color: "#26304228" } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#26304260" },
        timeScale: { borderColor: "#26304260", timeVisible: true, rightOffset: 14 },
        height: alto,
        autoSize: true,
      });

      const velas = chart.addCandlestickSeries({
        upColor: "#3fd07a", downColor: "#ff6b6b",
        wickUpColor: "#3fd07a", wickDownColor: "#ff6b6b",
        borderVisible: false,
      });
      velas.setData(barras.map((b) => ({
        time: b.time as never, open: b.open, high: b.high, low: b.low, close: b.close,
      })));

      // Niveles: líneas horizontales con su etiqueta en el eje.
      for (const n of niveles) {
        if (!(n.precio > 0)) continue;
        velas.createPriceLine({
          price: n.precio,
          color: n.color,
          lineWidth: 1,
          lineStyle: n.punteada ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: true,
          title: n.etiqueta,
        });
      }

      // ── Conos hacia adelante ──────────────────────────────────────────
      // El eje del tiempo se extiende con la misma separación que traen las
      // velas, así el cono ocupa el mismo "ancho" que el horizonte pedido.
      const ultima = barras[barras.length - 1];
      const paso = Math.max(1, ultima.time - barras[barras.length - 2].time);
      const PASOS = 24;
      const puntos = conePoints(spot, iv, dias, PASOS);

      // `enEscala: false` = la línea se dibuja pero NO cuenta para el zoom. El
      // cono de 2σ es tan ancho (con IV alta, ±20%) que si cuenta, las velas
      // quedan aplastadas en una franja de píxeles y no se ve nada.
      const serie = (color: string, ancho: 1 | 2, punteada: boolean, enEscala: boolean) =>
        chart.addLineSeries({
          color, lineWidth: ancho,
          lineStyle: punteada ? LineStyle.Dotted : LineStyle.Solid,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          ...(enEscala ? {} : { autoscaleInfoProvider: () => null }),
        });

      const alto1 = serie("#c9a227", 1, false, true);
      const bajo1 = serie("#c9a227", 1, false, true);
      const alto2 = serie("#4da3ff", 1, true, false);
      const bajo2 = serie("#4da3ff", 1, true, false);
      const trayectoria = serie("#e8d9a0", 2, false, true);

      const tiempo = (i: number) => (ultima.time + paso * i) as never;
      alto1.setData(puntos.map((p, i) => ({ time: tiempo(i), value: p.upper1 })));
      bajo1.setData(puntos.map((p, i) => ({ time: tiempo(i), value: p.lower1 })));
      alto2.setData(puntos.map((p, i) => ({ time: tiempo(i), value: p.upper2 })));
      bajo2.setData(puntos.map((p, i) => ({ time: tiempo(i), value: p.lower2 })));
      // Trayectoria base: del precio de ahora al objetivo, en línea recta.
      trayectoria.setData(puntos.map((p, i) => ({
        time: tiempo(i),
        value: spot + ((base - spot) * i) / PASOS,
      })));

      chart.timeScale().fitContent();
      limpiar = () => chart.remove();
    })();

    return () => { muerto = true; limpiar(); };
  }, [ticker, barras, spot, iv, dias, base, niveles, alto]);

  if (barras.length < 2) {
    return <div className="chart-empty">Sin velas para dibujar {ticker} ahora mismo.</div>;
  }

  return (
    <div className="mapa">
      <div className="mapa-titulo">{ticker} · mapa de proyección</div>
      <div ref={ref} className="mapa-canvas" />
      <div className="mapa-leyenda">
        <span className="mapa-chip">Precio {spot.toFixed(2)}</span>
        {niveles.filter((n) => n.precio > 0).map((n) => (
          <span key={n.etiqueta} className="mapa-chip" style={{ borderColor: `${n.color}66`, color: n.color }}>
            {n.etiqueta} {n.precio.toFixed(2)}
          </span>
        ))}
        <span className="mapa-chip" style={{ borderColor: "#c9a22766", color: "#c9a227" }}>
          Cono dorado = movimiento normal (1σ)
        </span>
        <span className="mapa-chip" style={{ borderColor: "#4da3ff66", color: "#4da3ff" }}>
          Cono azul = rango de estrés (2σ)
        </span>
      </div>
    </div>
  );
}
