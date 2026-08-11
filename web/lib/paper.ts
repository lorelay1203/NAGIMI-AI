// Diario de PAPER TRADING — trades simulados, sin dinero real, sin ejecución.
// Guarda cada idea con su precio de entrada; luego se marca a mercado en la UI
// para medir si el motor realmente gana. Archivo: web/data/paper_trades.json.

import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "paper_trades.json");

export interface PaperLeg {
  type: "call" | "put" | "stock";
  side: "buy" | "sell";
  strike?: number;
  expiration?: string; // YYYY-MM-DD
  qty: number;
}

export interface PaperTrade {
  id: string;
  ticker: string;
  label: string;            // ej. "Bull call 100/105"
  legs: PaperLeg[];
  entryNet: number;         // débito neto pagado por contrato (>0 pagas, <0 cobras)
  qtyContracts: number;     // nº de veces la estructura
  entryTime: string;        // ISO
  entrySpot?: number;       // precio del subyacente al entrar
  status: "open" | "closed";
  exitNet?: number;         // débito neto al cerrar (por contrato)
  exitTime?: string;
  note?: string;
  /** Explicación larga de POR QUÉ el motor eligió este trade (se ve al tocarlo). */
  rationale?: string;
  source: "motor" | "manual";
}

async function readAll(): Promise<PaperTrade[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as PaperTrade[];
  } catch {
    return [];
  }
}

async function writeAll(list: PaperTrade[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function listPaper(): Promise<PaperTrade[]> {
  return (await readAll()).sort((a, b) => (a.entryTime < b.entryTime ? 1 : -1));
}

// id sin depender de Date.now()/random (bloqueados): contador + timestamp de entrada.
function makeId(list: PaperTrade[], entryTime: string): string {
  return `pt_${list.length + 1}_${entryTime.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

export async function openPaper(
  t: Omit<PaperTrade, "id" | "status">
): Promise<PaperTrade> {
  const list = await readAll();
  const trade: PaperTrade = { ...t, id: makeId(list, t.entryTime), status: "open" };
  list.push(trade);
  await writeAll(list);
  return trade;
}

export async function closePaper(id: string, exitNet: number, exitTime: string): Promise<boolean> {
  const list = await readAll();
  const t = list.find((x) => x.id === id);
  if (!t) return false;
  t.status = "closed";
  t.exitNet = exitNet;
  t.exitTime = exitTime;
  await writeAll(list);
  return true;
}

export async function deletePaper(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}
