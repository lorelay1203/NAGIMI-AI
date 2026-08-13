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

/**
 * Lee el diario. CLAVE: distingue "el archivo no existe todavía" (lista vacía
 * legítima) de "el archivo existe pero falló al leerse/parsearse". En el segundo
 * caso LANZA en vez de devolver [], porque devolver [] haría que el siguiente
 * writeAll SOBRESCRIBA con vacío y borre todos los trades. Un JSON corrupto se
 * respalda y también lanza — nunca se pierde lo que había.
 */
async function readAll(): Promise<PaperTrade[]> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return []; // aún no existe
    throw new Error(`No se pudo leer el diario de paper (no se toca para no perderlo): ${(e as Error)?.message}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return []; // archivo vacío legítimo
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as PaperTrade[]) : [];
  } catch {
    await fs.copyFile(FILE, `${FILE}.corrupt-${Date.now()}.bak`).catch(() => {});
    throw new Error("El diario de paper estaba corrupto; se respaldó y NO se sobrescribe.");
  }
}

/** Guardado ATÓMICO: escribe a un temporal y renombra. Un corte a mitad no corrompe el archivo real. */
async function writeAll(list: PaperTrade[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export async function listPaper(): Promise<PaperTrade[]> {
  return (await readAll()).sort((a, b) => (a.entryTime < b.entryTime ? 1 : -1));
}

// id único: contador + timestamp de entrada, y si colisiona con uno existente sube
// el contador hasta que sea único (evita los IDs duplicados tras borrar trades).
function makeId(list: PaperTrade[], entryTime: string): string {
  const stamp = entryTime.replace(/[^0-9]/g, "").slice(0, 14);
  const existing = new Set(list.map((t) => t.id));
  let n = list.length + 1;
  let id = `pt_${n}_${stamp}`;
  while (existing.has(id)) { n += 1; id = `pt_${n}_${stamp}`; }
  return id;
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
