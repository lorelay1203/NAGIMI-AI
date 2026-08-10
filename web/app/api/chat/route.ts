// POST /api/chat  {message, context, history} → responde con Claude usando el análisis.
// GET  /api/chat  → { hasKey } para saber si falta la API key.

import { getApiKey } from "@/lib/chatKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5-20251001"; // barato; cámbialo a claude-sonnet-5 para más calidad.

const SYSTEM = `Eres el asistente de estudio de Nagimi AI, una app de análisis de OPCIONES. Respondes en español, claro y simple, como para una estudiante que está aprendiendo.
Usas SOLO el contexto de análisis que te doy (dirección del flujo, muros de GEX, imán, escenarios, IV, confianza, Risk Gate) para explicar y sugerir ideas de estrategias de opciones (calls, puts, verticales, venta de prima/créditos, butterfly, condor, iron condor).
Reglas SIEMPRE:
1) Es material EDUCATIVO, no consejo financiero. Termina recordándolo en una línea corta.
2) Recuerda la regla de riesgo: máximo 1–2% del capital por operación.
3) Nagimi PREPARA, nunca ejecuta: la decisión y la orden las coloca ella en su broker.
4) Si algo del contexto es una red flag (datos poco fiables, va contra la dirección, excede el 2%), dilo con claridad.
5) No inventes precios ni datos que no estén en el contexto. Si falta info, dilo.
Sé concreto y breve (máximo ~180 palabras).`;

interface Msg { role: "user" | "assistant"; content: string }

export async function GET() {
  return Response.json({ hasKey: getApiKey().length > 0 });
}

export async function POST(request: Request) {
  const key = getApiKey();
  if (!key) return Response.json({ error: "needkey" });

  let body: { message?: string; context?: unknown; history?: Msg[] };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }
  const message = (body.message ?? "").trim();
  if (!message) return Response.json({ error: "Escribe una pregunta." }, { status: 400 });

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const ctx = `Contexto del análisis actual (JSON):\n${JSON.stringify(body.context ?? {}, null, 2)}`;
  const messages: Msg[] = [...history, { role: "user", content: `${ctx}\n\nPregunta de la usuaria: ${message}` }];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages }),
    });
    const j = await r.json();
    if (!r.ok) return Response.json({ error: j?.error?.message ?? `Error ${r.status} de Anthropic` });
    const reply = (j.content ?? []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text ?? "").join("\n").trim();
    return Response.json({ reply: reply || "(sin respuesta)" });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fallo de red con Anthropic." });
  }
}
