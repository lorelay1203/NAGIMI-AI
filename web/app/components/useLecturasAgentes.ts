"use client";

// 👥 Lecturas en vivo de los agentes de contexto (los que no necesitan el
// escaneo completo del flujo): Técnicos, Sentimiento, Macro, Catalizadores y
// Riesgo. Lo usan la página de Agentes y el panel lateral, para que los dos
// digan exactamente lo mismo.
//
// Cada agente arranca en "cargando" y termina con su lectura o "sin dato":
// nunca con una lectura inventada.

import { useCallback, useState } from "react";
import { gammaSkew } from "@/lib/gammaSkew";
import type { Catalizador } from "@/lib/catalizador";

export interface Vivo {
  /** Lo que ve el agente ahora. */
  viendo: string;
  empuje: string | null;
  senal: string;
  tono: "up" | "down" | "neutral";
}

export type EstadoAgente = Vivo | "cargando" | "sin dato";

export function useLecturasAgentes() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [vivos, setVivos] = useState<Record<string, EstadoAgente>>({});

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

  return { ticker, vivos, analizar };
}
