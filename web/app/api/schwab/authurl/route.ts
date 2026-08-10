// GET /api/schwab/authurl — URL de login de Schwab + si ya está conectado.
import { authUrl, isConnected } from "@/lib/schwab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ url: authUrl(), connected: await isConnected() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error" }, { status: 400 });
  }
}
