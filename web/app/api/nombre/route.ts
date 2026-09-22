// GET /api/nombre?ticker=NVDA → { ticker, name } — solo el nombre de la empresa,
// para la tabla "Tu investigación" del panel. Si no se encuentra, name: null.

import { fetchTickerName } from "@/lib/massive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return Response.json({ error: "ticker requerido" }, { status: 400 });
  const name = await fetchTickerName(ticker).catch(() => null);
  return Response.json(
    { ticker, name },
    { headers: name ? { "Cache-Control": "public, max-age=86400" } : {} },
  );
}
