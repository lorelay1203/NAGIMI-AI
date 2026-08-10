// POST /api/schwab/connect — recibe la URL de retorno de Schwab y guarda los tokens.
import { codeFromRedirect, exchangeCode } from "@/lib/schwab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { redirect?: string };
    const redirect = (body?.redirect ?? "").toString().trim();
    if (!redirect) return Response.json({ error: "Falta la URL de retorno." }, { status: 400 });
    await exchangeCode(codeFromRedirect(redirect));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error" }, { status: 502 });
  }
}
