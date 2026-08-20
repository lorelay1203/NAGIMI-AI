// POST /api/marketsnack-login  {email, password}  → guarda credenciales y prueba login
// POST /api/marketsnack-login  {action:"relogin"}  → re-loguea con las guardadas
// POST /api/marketsnack-login  {action:"clear"}    → borra credenciales (apaga auto-login)
// GET  /api/marketsnack-login  → { hasLogin }

import { setLogin, hasLogin, reloginMarketsnack, clearLogin } from "@/lib/marketsnackLogin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // el login headless puede tardar

export async function GET() {
  return Response.json({ hasLogin: await hasLogin() });
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; action?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }

  try {
    if (body.action === "clear") {
      await clearLogin();
      return Response.json({ ok: true });
    }
    if (body.action === "relogin") {
      const ok = await reloginMarketsnack(true); // forzar (salta el enfriamiento)
      return Response.json(ok ? { ok: true } : { error: "El login no consiguió una sesión válida." }, { status: ok ? 200 : 400 });
    }

    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) return Response.json({ error: "Falta email o contraseña." }, { status: 400 });

    await setLogin(email, password);
    const ok = await reloginMarketsnack(true);
    return Response.json(ok ? { ok: true } : { error: "Credenciales guardadas, pero el login falló. Revisa email/contraseña." }, { status: ok ? 200 : 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fallo en el login." }, { status: 500 });
  }
}
