// Diario de trading (JOURNALING) — reflexiones, lecciones, errores, ideas.
// Distinto del Paper Trading (eso mide P/L). Archivo: web/data/journal.json.

import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "journal.json");

export type JournalTag = "leccion" | "error" | "idea" | "emocion" | "nota";

export interface JournalEntry {
  id: string;
  createdAt: string;   // ISO
  ticker?: string;
  title: string;
  body: string;
  tag: JournalTag;
}

async function readAll(): Promise<JournalEntry[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as JournalEntry[];
  } catch {
    return [];
  }
}

async function writeAll(list: JournalEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function listJournal(): Promise<JournalEntry[]> {
  return (await readAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// id sin Date.now()/random: contador + timestamp de creación.
function makeId(list: JournalEntry[], createdAt: string): string {
  return `j_${list.length + 1}_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

export async function addJournal(e: Omit<JournalEntry, "id">): Promise<JournalEntry> {
  const list = await readAll();
  const entry: JournalEntry = { ...e, id: makeId(list, e.createdAt) };
  list.push(entry);
  await writeAll(list);
  return entry;
}

export async function deleteJournal(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}
