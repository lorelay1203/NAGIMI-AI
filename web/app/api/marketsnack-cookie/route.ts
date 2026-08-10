// GET  /api/marketsnack-cookie  → estado actual de la cookie (existe / válida).
// POST /api/marketsnack-cookie  {cookie} → guarda la cookie nueva y la prueba. Sin reinicio.

import { getMarketsnackCookie, setMarketsnackCookie, validateMarketsnackCookie } from "@/lib/marketsnackCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = getMarketsnackCookie();
  const hasCookie = c.length > 0;
  const valid = hasCookie ? await validateMarketsnackCookie(c) : false;
  return Response.json({ hasCookie, valid });
}

export async function POST(request: Request) {
  let body: { cookie?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const raw = (body.cookie ?? "").trim();
  if (!raw || !/_market_snack_session=/.test(raw)) {
    return Response.json({ error: "Pega la cookie completa. Debe incluir '_market_snack_session='." }, { status: 400 });
  }
  const saved = await setMarketsnackCookie(raw);
  const valid = await validateMarketsnackCookie(saved);
  return Response.json({ ok: true, valid });
}
