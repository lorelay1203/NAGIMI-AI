// /api/vigia — el vigía de muros (avisos al celular por ntfy).
//   GET                         → configuración y estado
//   POST {accion:"probar"}      → manda un aviso de prueba
//   POST {accion:"revisar"}     → revisa ahora mismo (aunque no haya mercado)
//   POST {accion:"config", tickers?, activo?, minutos?} → cambia la configuración

import { enviarNtfy, guardarConfigVigia, iniciarVigia, leerConfigVigia, leerEstadoVigia, revisarMurosUnaVez } from "@/lib/vigiaServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  await iniciarVigia();
  const [config, estado] = await Promise.all([leerConfigVigia(), leerEstadoVigia()]);
  return Response.json({ config, estado });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    accion?: string; tickers?: string[]; activo?: boolean; minutos?: number;
  };
  const config = await leerConfigVigia();
  try {
    if (body.accion === "probar") {
      await enviarNtfy(config.ntfyTema, "Nagimi: prueba de aviso",
        "Si ves esto, los avisos de muros te van a llegar al celular. 📈");
      return Response.json({ ok: true });
    }
    if (body.accion === "revisar") {
      return Response.json({ ok: true, ...(await revisarMurosUnaVez(true)) });
    }
    if (body.accion === "config") {
      const tickers = Array.isArray(body.tickers)
        ? body.tickers.map((t) => String(t).trim().toUpperCase()).filter((t) => /^[A-Z.]{1,6}$/.test(t)).slice(0, 10)
        : config.tickers;
      const nueva = {
        ...config,
        tickers,
        activo: typeof body.activo === "boolean" ? body.activo : config.activo,
        minutos: Number(body.minutos) >= 1 ? Math.min(60, Math.round(Number(body.minutos))) : config.minutos,
      };
      await guardarConfigVigia(nueva);
      return Response.json({ ok: true, config: nueva });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo." }, { status: 502 });
  }
}
