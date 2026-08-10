// API del diario (Journaling).
//   GET  /api/journal                       → lista de entradas
//   POST /api/journal {action:"add", entry} → agrega una entrada
//   POST /api/journal {action:"delete", id} → borra una entrada

import { listJournal, addJournal, deleteJournal, type JournalEntry } from "@/lib/journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ entries: await listJournal() });
}

export async function POST(request: Request) {
  let body: { action?: string; entry?: Omit<JournalEntry, "id">; id?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }

  if (body.action === "add") {
    const e = body.entry;
    if (!e || !e.title?.trim() || !e.createdAt) {
      return Response.json({ error: "Falta título o fecha." }, { status: 400 });
    }
    return Response.json({ ok: true, entry: await addJournal(e) });
  }

  if (body.action === "delete") {
    if (!body.id) return Response.json({ error: "Falta id." }, { status: 400 });
    const ok = await deleteJournal(body.id);
    return Response.json(ok ? { ok: true } : { error: "Entrada no encontrada." }, { status: ok ? 200 : 404 });
  }

  return Response.json({ error: "Acción no reconocida." }, { status: 400 });
}
