// POST /api/tastytrade/order → revisa (dry-run) o envía una orden de opciones.
// `confirm: true` es lo único que dispara el envío real; sin él siempre es dry-run.

import { dryRunOrder, isConnected, placeOrder, TastyError, type SubmitOrderInput } from "@/lib/tastytrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body extends SubmitOrderInput {
  confirm?: boolean;
}

function validate(b: Partial<Body>): string | null {
  if (!b.accountNumber) return "Falta la cuenta.";
  if (!b.underlying) return "Falta el ticker.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expiration ?? "")) return "Vencimiento inválido (usa AAAA-MM-DD).";
  if (!Array.isArray(b.legs) || b.legs.length === 0) return "La orden no tiene patas.";
  if (b.legs.some((l) => !(l.strike > 0) || !(l.quantity > 0))) return "Hay patas con strike o cantidad inválidos.";
  if (!(typeof b.price === "number" && b.price > 0)) return "Falta el precio límite neto.";
  if (b.priceEffect !== "Debit" && b.priceEffect !== "Credit") return "Falta indicar débito o crédito.";
  return null;
}

export async function POST(req: Request) {
  if (!(await isConnected())) {
    return Response.json({ error: "No conectado a Tastytrade." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Partial<Body> | null;
  if (!body) return Response.json({ error: "Cuerpo inválido." }, { status: 400 });

  const bad = validate(body);
  if (bad) return Response.json({ error: bad }, { status: 400 });

  const order = body as Body;
  const sent = order.confirm === true;
  try {
    const result = sent ? await placeOrder(order) : await dryRunOrder(order);
    return Response.json({ sent, ...result });
  } catch (e) {
    const msg = e instanceof TastyError ? e.message : "Error enviando la orden a Tastytrade.";
    const status = e instanceof TastyError && e.status ? e.status : 500;
    return Response.json({ error: msg }, { status });
  }
}
