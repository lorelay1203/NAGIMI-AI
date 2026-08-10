// POST /api/tastytrade/connect  {clientId, clientSecret, refreshToken, env}
//   → guarda credenciales y las valida sacando un access token. Sin reiniciar.
// GET  /api/tastytrade/connect  → { connected }

import { setCreds, isConnected, validate, TastyError } from "@/lib/tastytrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ connected: await isConnected() });
}

export async function POST(request: Request) {
  let body: { clientId?: string; clientSecret?: string; refreshToken?: string; env?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }

  const clientId = (body.clientId ?? "").trim();
  const clientSecret = (body.clientSecret ?? "").trim();
  const refreshToken = (body.refreshToken ?? "").trim();
  const env = body.env === "sandbox" ? "sandbox" : "prod";

  if (!clientId || !clientSecret || !refreshToken) {
    return Response.json({ error: "Faltan Client ID, Client Secret o Refresh Token." }, { status: 400 });
  }

  await setCreds({ clientId, clientSecret, refreshToken, env });
  try {
    await validate();
    return Response.json({ ok: true, connected: true, env });
  } catch (e) {
    const msg = e instanceof TastyError ? e.message : "No se pudo validar con Tastytrade.";
    return Response.json({ error: msg, saved: true }, { status: 400 });
  }
}
