// GET /api/tastytrade/accounts → cuentas con balance y posiciones (SOLO LECTURA).

import { getAccounts, isConnected, TastyError } from "@/lib/tastytrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isConnected())) {
    return Response.json({ error: "No conectado a Tastytrade." }, { status: 401 });
  }
  try {
    return Response.json(await getAccounts());
  } catch (e) {
    const msg = e instanceof TastyError ? e.message : "Error leyendo cuentas de Tastytrade.";
    const status = e instanceof TastyError && e.status ? e.status : 500;
    return Response.json({ error: msg }, { status });
  }
}
