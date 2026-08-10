// POST /api/chat/key  {apiKey} → guarda la API key de Anthropic (sin reiniciar).

import { setApiKey } from "@/lib/chatKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { apiKey?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }
  const k = (body.apiKey ?? "").trim();
  if (!k.startsWith("sk-ant-")) return Response.json({ error: "La key de Anthropic empieza con 'sk-ant-...'." }, { status: 400 });
  await setApiKey(k);
  return Response.json({ ok: true });
}
