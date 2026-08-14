// Tipos del evento SSE del screener de Wheel. Ver app/api/wheel/route.ts.

import type { WheelCandidate } from "@/lib/wheel";

/** Un candidato con lo que el CLIENTE necesita para juzgar asequibilidad. */
export type WheelIdea = WheelCandidate;

export interface WheelStepEvent {
  type: "step";
  label: string;
}

/** Progreso en vivo: cuántos tickers van y los candidatos acumulados hasta ahora. */
export interface WheelProgressEvent {
  type: "progress";
  done: number;
  total: number;
  candidates: WheelIdea[];
}

export interface WheelDoneEvent {
  type: "done";
  candidates: WheelIdea[];
  meta: {
    preset: string;
    scanned: number;
    failed: number;
    withCandidates: number;
    /** true si falló más de la mitad del universo. */
    degraded: boolean;
  };
}

export interface WheelErrorEvent {
  type: "error";
  message: string;
}

export type WheelSseEvent = WheelStepEvent | WheelProgressEvent | WheelDoneEvent | WheelErrorEvent;
