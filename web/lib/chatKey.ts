// API key de Anthropic (para el chat) — guardada en runtime (sin reiniciar).
// Archivo web/data/anthropic_key.txt, con fallback a process.env.ANTHROPIC_API_KEY.

import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "anthropic_key.txt");

export function getApiKey(): string {
  try {
    const k = fs.readFileSync(FILE, "utf8").trim();
    if (k) return k;
  } catch { /* sin archivo → env */ }
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export async function setApiKey(k: string): Promise<void> {
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE, k.trim(), "utf8");
}
