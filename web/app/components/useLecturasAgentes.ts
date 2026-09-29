"use client";

// 👥 Lecturas en vivo de los agentes de contexto (los que no necesitan el
// escaneo completo del flujo): Técnicos, Sentimiento, Macro, Catalizadores y
// Riesgo. Lo usan la página de Agentes y el panel lateral, para que los dos
// digan exactamente lo mismo.
//
// Cada agente arranca en "cargando" y termina con su lectura o "sin dato":
// nunca con una lectura inventada.

import { useCallback, useState } from "react";
import type { Catalizador } from "@/lib/catalizador";

export interface Vivo {
  /** Lo que ve el agente ahora. */
  viendo: string;
  empuje: string | null;
  senal: string;
  tono: "up" | "down" | "neutral";
  /** Una línea por pieza de la lectura, cuando el agente las da (Riesgo). */
  detalles?: string[];
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

    // Riesgo: las cinco piezas (resbala, liquidez, mercado, día malo y
    // confianza) vienen armadas de /api/riesgo.
    fetch(`/api/riesgo?ticker=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d: { riesgo?: Vivo & { detalles?: string[] } }) => {
        const r = d.riesgo;
        setVivos((v) => ({
          ...v,
          RSK: r ? { viendo: r.viendo, empuje: r.empuje, senal: r.senal, tono: r.tono, detalles: r.detalles } : "sin dato",
        }));
      })
      .catch(() => setVivos((v) => ({ ...v, RSK: "sin dato" })));
  }, []);

  return { ticker, vivos, analizar };
}
