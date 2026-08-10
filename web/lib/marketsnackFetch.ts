// fetch compartido para MarketSnack: inyecta la cookie y, si la sesión caducó
// (401/403/redirección), re-loguea SOLO con Playwright y reintenta UNA vez.
// Así la cookie se renueva invisible, sin que la usuaria toque nada.

import { getMarketsnackCookie } from "./marketsnackCookie";
import { reloginMarketsnack, hasLogin } from "./marketsnackLogin";

function expired(status: number): boolean {
  return status === 401 || status === 403 || (status >= 300 && status < 400);
}

export async function msFetch(url: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const doFetch = () =>
    fetch(url, {
      headers: { Accept: "application/json", ...extraHeaders, Cookie: getMarketsnackCookie() },
      cache: "no-store",
      redirect: "manual",
    });

  let res = await doFetch();
  // Solo intentamos el auto-relogin si hay credenciales guardadas (auto-login activo).
  if (expired(res.status) && (await hasLogin())) {
    const ok = await reloginMarketsnack();
    if (ok) res = await doFetch(); // reintento único con la cookie fresca
  }
  return res;
}
