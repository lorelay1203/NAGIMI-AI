// API del diario de PAPER TRADING (simulado, sin dinero real).
//   GET  /api/paper                → lista de trades
//   POST /api/paper  {action:"open",   trade}          → registra un trade en papel
//   POST /api/paper  {action:"close",  id, exitNet, exitTime}  → cierra un trade
//   POST /api/paper  {action:"delete", id}             → borra un trade

import { listPaper, openPaper, closePaper, deletePaper, type PaperTrade } from "@/lib/paper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ trades: await listPaper() });
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    trade?: Omit<PaperTrade, "id" | "status">;
    id?: string;
    exitNet?: number;
    exitTime?: string;
  };
  try { body = await request.json(); } catch { return Response.json({ error: "Body inválido." }, { status: 400 }); }

  if (body.action === "open") {
    const t = body.trade;
    if (!t || !t.ticker || !Array.isArray(t.legs) || t.legs.length === 0) {
      return Response.json({ error: "Faltan datos del trade (ticker, legs)." }, { status: 400 });
    }
    return Response.json({ ok: true, trade: await openPaper(t) });
  }

  if (body.action === "close") {
    if (!body.id || typeof body.exitNet !== "number" || !body.exitTime) {
      return Response.json({ error: "Faltan id, exitNet o exitTime." }, { status: 400 });
    }
    const ok = await closePaper(body.id, body.exitNet, body.exitTime);
    return Response.json(ok ? { ok: true } : { error: "Trade no encontrado." }, { status: ok ? 200 : 404 });
  }

  if (body.action === "delete") {
    if (!body.id) return Response.json({ error: "Falta id." }, { status: 400 });
    const ok = await deletePaper(body.id);
    return Response.json(ok ? { ok: true } : { error: "Trade no encontrado." }, { status: ok ? 200 : 404 });
  }

  return Response.json({ error: "Acción no reconocida." }, { status: 400 });
}
