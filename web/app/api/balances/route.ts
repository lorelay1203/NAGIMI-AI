// GET /api/balances — dinero real disponible en los brokers conectados.
// Solo lectura. Si un broker necesita reconexión se informa, no se asume $0.

import { getSaldos } from "@/lib/balances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const saldos = await getSaldos();
  return Response.json(saldos);
}
