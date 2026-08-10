// GET /api/schwab/accounts — SOLO LECTURA: cuentas y posiciones de Schwab.
import { getAccounts, SchwabError } from "@/lib/schwab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getAccounts());
  } catch (err) {
    const msg = err instanceof SchwabError ? err.message : "Error al leer cuentas.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
