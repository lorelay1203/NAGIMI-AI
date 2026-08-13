// Motor automático de paper (simulado). Escanea el mercado buscando POP ≥ 90% y
// registra 1 contrato de cada uno en el diario. Guardián de "una vez al día".
//   GET  /api/paper-scan            → estado (última corrida, si ya corrió hoy)
//   POST /api/paper-scan            → corre si no ha corrido hoy
//   POST /api/paper-scan {force:true} → corre ahora aunque ya haya corrido

import { promises as fs } from "fs";
import path from "path";
import { runAutoScan, type ScanResult } from "@/lib/autoPaperScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_FILE = path.join(process.cwd(), "data", "paper_scan_state.json");

interface ScanState {
  lastRunDate: string | null; // "YYYY-MM-DD" (día de mercado ET)
  lastResult: Omit<ScanResult, "candidates"> & { candidates: ScanResult["candidates"] } | null;
}

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readState(): Promise<ScanState> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as ScanState;
  } catch {
    return { lastRunDate: null, lastResult: null };
  }
}

async function writeState(s: ScanState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

export async function GET() {
  const s = await readState();
  return Response.json({ ranToday: s.lastRunDate === todayET(), today: todayET(), ...s });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; maxRisk?: number; minPop?: number; minReturn?: number; term?: "0dte" | "corto" | "normal" };
  const today = todayET();
  const state = await readState();

  if (!body.force && state.lastRunDate === today) {
    return Response.json({ ranToday: true, skipped: "ya corrió hoy", today, ...state });
  }

  const maxRisk = body.maxRisk && body.maxRisk > 0 ? body.maxRisk : 100;
  // POP objetivo configurable (0-1). Por defecto 60% (mejor premio que el 90%).
  const popTarget = body.minPop && body.minPop > 0 && body.minPop <= 1 ? body.minPop : 0.6;
  // Ganancia mínima como fracción del riesgo (0.25 = 25%).
  const minReturn = body.minReturn && body.minReturn > 0 && body.minReturn <= 5 ? body.minReturn : 0.25;
  const term = body.term === "0dte" ? "0dte" : body.term === "corto" ? "corto" : "normal";
  const result = await runAutoScan({ popTarget, maxNames: 12, maxRisk, minReturn, term });
  const next: ScanState = { lastRunDate: today, lastResult: result };
  await writeState(next);
  return Response.json({ ranToday: true, today, justRan: true, ...next });
}
