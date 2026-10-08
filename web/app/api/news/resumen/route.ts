// POST /api/news/resumen  { ticker, empresa, titulares: TitularEntrada[] }
//   → { simples: NoticiasSimples | null }  ·  { error } si falta la clave o falla.
//
// Traduce los titulares que ya mostró la tarjeta de noticias y explica, en
// palabras simples, qué está pasando y cómo podría afectar a la acción.

import { ClaveInvalidaError, noticiasSimples, SinClaveError, type TitularEntrada } from "@/lib/noticiasSimples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TITULARES = 12;

export async function POST(request: Request) {
  let body: { ticker?: string; empresa?: string | null; titulares?: TitularEntrada[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Pedido mal formado." }, { status: 400 });
  }
  const ticker = (body.ticker ?? "").trim().toUpperCase();
  const titulares = Array.isArray(body.titulares) ? body.titulares.slice(0, MAX_TITULARES) : [];
  if (!ticker || titulares.length === 0) return Response.json({ simples: null });

  try {
    const simples = await noticiasSimples(ticker, body.empresa ?? null, titulares);
    return Response.json({ simples });
  } catch (err) {
    if (err instanceof SinClaveError) {
      return Response.json({ error: "Falta conectar la clave de Anthropic para traducir las noticias." }, { status: 503 });
    }
    if (err instanceof ClaveInvalidaError) {
      return Response.json({ error: "La clave de la IA (Anthropic) que tiene guardada Nagimi ya no sirve. Pega una nueva con el botón «🔑 Cambiar la clave de la IA» del chat, en la pestaña Resumen." }, { status: 401 });
    }
    console.error("[news/resumen]", err instanceof Error ? err.message : err);
    return Response.json({ error: "No se pudieron traducir las noticias ahora mismo." }, { status: 502 });
  }
}
