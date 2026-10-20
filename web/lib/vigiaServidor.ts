// ============================================================================
// Servidor del vigía de muros: cada pocos minutos, en horario de mercado,
// arma la línea de cada ticker vigilado, la compara con la anterior y, si los
// muros cambiaron, avisa al celular por ntfy (app gratis, sin cuenta).
//
// Archivos (en /data, que no se sube a GitHub):
//   data/vigia.json         configuración: tickers, canal de ntfy, cada cuánto
//   data/vigia_estado.json  la última foto de cada ticker y el último aviso
// ============================================================================

import { promises as fs } from "fs";
import path from "path";
import { armarLineaDeTicker } from "./lineaServidor";
import { armarAviso, cambiosMuros, enHorarioMercado, temaAleatorio, type FotoMuros } from "./vigiaMuros";

export interface ConfigVigia {
  activo: boolean;
  tickers: string[];
  ntfyTema: string;
  minutos: number;
}

export interface EstadoVigia {
  fotos: Record<string, FotoMuros>;
  ultimaRevision: string | null;
  ultimoAviso: { ticker: string; titulo: string; hora: string } | null;
  ultimoError: string | null;
}

const DIR = path.join(process.cwd(), "data");
const ARCH_CONFIG = path.join(DIR, "vigia.json");
const ARCH_ESTADO = path.join(DIR, "vigia_estado.json");

const CONFIG_INICIAL = (): ConfigVigia => ({
  activo: true,
  tickers: ["SPY", "QQQ", "SPX", "TSLA"],
  ntfyTema: temaAleatorio(),
  minutos: 5,
});

async function leerJson<T>(archivo: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(archivo, "utf8")) as T;
  } catch {
    return null;
  }
}

async function guardarJson(archivo: string, datos: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(archivo, JSON.stringify(datos, null, 2), "utf8");
}

/** La configuración; la primera vez se crea con un canal de ntfy nuevo. */
export async function leerConfigVigia(): Promise<ConfigVigia> {
  const c = await leerJson<ConfigVigia>(ARCH_CONFIG);
  if (c && c.ntfyTema) return { ...CONFIG_INICIAL(), ...c };
  const nueva = CONFIG_INICIAL();
  await guardarJson(ARCH_CONFIG, nueva);
  return nueva;
}

export async function guardarConfigVigia(c: ConfigVigia): Promise<void> {
  await guardarJson(ARCH_CONFIG, c);
}

export async function leerEstadoVigia(): Promise<EstadoVigia> {
  return (await leerJson<EstadoVigia>(ARCH_ESTADO)) ?? { fotos: {}, ultimaRevision: null, ultimoAviso: null, ultimoError: null };
}

/** Manda un aviso al celular por ntfy. La línea va en un botón "Copiar línea". */
export async function enviarNtfy(tema: string, titulo: string, mensaje: string, lineaParaCopiar?: string): Promise<void> {
  const res = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: tema,
      title: titulo,
      message: mensaje,
      tags: ["chart_with_upwards_trend"],
      priority: 4,
      ...(lineaParaCopiar ? { actions: [{ action: "copy", label: "Copiar línea", value: lineaParaCopiar }] } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
}

/** Una vuelta del vigía: revisa todos los tickers y avisa lo que cambió. */
export async function revisarMurosUnaVez(forzar = false): Promise<{ revisados: number; avisos: string[]; errores: string[] }> {
  const config = await leerConfigVigia();
  const estado = await leerEstadoVigia();
  const avisos: string[] = [];
  const errores: string[] = [];
  if (!forzar && (!config.activo || !enHorarioMercado(new Date()))) return { revisados: 0, avisos, errores };

  for (const ticker of config.tickers) {
    try {
      const r = await armarLineaDeTicker(ticker);
      const ahora: FotoMuros = {
        ticker: r.datos.ticker, fecha: r.datos.fecha, spot: r.datos.spot,
        callWall: r.datos.callWall, putWall: r.datos.putWall, magnet: r.datos.magnet,
        gammaFlip: r.datos.gammaFlip, regime: r.datos.regime, linea: r.linea,
      };
      const cambios = cambiosMuros(estado.fotos[ticker] ?? null, ahora);
      if (cambios.length > 0) {
        const a = armarAviso(ahora, cambios);
        await enviarNtfy(config.ntfyTema, a.titulo, a.mensaje, r.linea);
        avisos.push(a.titulo);
        estado.ultimoAviso = { ticker, titulo: a.titulo, hora: new Date().toISOString() };
      }
      estado.fotos[ticker] = ahora;
    } catch (e) {
      errores.push(`${ticker}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  estado.ultimaRevision = new Date().toISOString();
  estado.ultimoError = errores.length ? errores.join(" · ") : null;
  await guardarJson(ARCH_ESTADO, estado);
  return { revisados: config.tickers.length, avisos, errores };
}

// Un solo reloj por proceso, aunque Next recargue el módulo.
const G = globalThis as unknown as { __vigiaMuros?: ReturnType<typeof setInterval>; __vigiaCorriendo?: boolean };

/** Prende el reloj del vigía (lo llama instrumentation.ts al arrancar Nagimi). */
export async function iniciarVigia(): Promise<void> {
  if (G.__vigiaMuros) return;
  const config = await leerConfigVigia();
  const cada = Math.max(1, config.minutos) * 60_000;
  G.__vigiaMuros = setInterval(() => {
    if (G.__vigiaCorriendo) return;            // no encimar vueltas lentas
    G.__vigiaCorriendo = true;
    revisarMurosUnaVez()
      .catch(() => { /* el error queda guardado en la siguiente vuelta */ })
      .finally(() => { G.__vigiaCorriendo = false; });
  }, cada);
}
