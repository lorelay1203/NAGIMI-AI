// GET /api/bigmoney            → lista de inversores grandes
// GET /api/bigmoney?investor=X → sus jugadas del último trimestre (13F de la SEC)

import { GROUP_LABEL, INVESTORS, fetchFund } from "@/lib/bigMoney";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // bajar y parsear el 13F puede tardar

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const investor = searchParams.get("investor");
  if (!investor) {
    return Response.json({
      investors: INVESTORS.map(({ id, name, fund, group, note }) => ({ id, name, fund, group, note })),
      groups: GROUP_LABEL,
    });
  }
  try {
    const report = await fetchFund(investor);
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo cargar el 13F." }, { status: 502 });
  }
}
