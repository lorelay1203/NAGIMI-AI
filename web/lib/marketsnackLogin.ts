// Auto-login de MarketSnack con navegador headless (Playwright).
// Inicia sesión como un humano, captura la cookie de sesión y la guarda con
// setMarketsnackCookie(). Se usa para renovar la cookie SOLA cuando caduca.
// Credenciales: data/marketsnack_login.json (local, en .gitignore). Sin ejecución.

import { promises as fs } from "fs";
import path from "path";
import { setMarketsnackCookie, validateMarketsnackCookie } from "./marketsnackCookie";

const LOGIN_FILE = path.join(process.cwd(), "data", "marketsnack_login.json");

interface Login { email: string; password: string }

export async function setLogin(email: string, password: string): Promise<void> {
  await fs.mkdir(path.dirname(LOGIN_FILE), { recursive: true });
  await fs.writeFile(LOGIN_FILE, JSON.stringify({ email: email.trim(), password }, null, 2), "utf8");
}

export async function getLogin(): Promise<Login | null> {
  try {
    const j = JSON.parse(await fs.readFile(LOGIN_FILE, "utf8")) as Login;
    return j.email && j.password ? j : null;
  } catch {
    return null;
  }
}

export async function hasLogin(): Promise<boolean> {
  return (await getLogin()) != null;
}

// Evita abrir varios navegadores a la vez si llegan muchos 401 juntos.
let inFlight: Promise<boolean> | null = null;

/** Inicia sesión headless y guarda la cookie fresca. Devuelve true si funcionó. */
export async function reloginMarketsnack(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = doRelogin().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Lanza un navegador headless de forma ROBUSTA. El navegador empaquetado de
 * Playwright ("chrome-headless-shell") se rompe seguido en esta máquina y deja
 * la renovación automática muerta. Primero probamos el Edge/Chrome DEL SISTEMA
 * (Windows siempre tiene Edge) — esos no dependen de la descarga frágil de
 * Playwright. Solo si ninguno está, caemos al chromium empaquetado.
 */
async function launchBrowser() {
  const { chromium } = await import("playwright");
  const errors: string[] = [];
  for (const channel of ["msedge", "chrome"] as const) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (e) {
      errors.push(`${channel}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  // Último recurso: el chromium que trae Playwright (puede fallar si no está instalado).
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    errors.push(`bundled: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    throw new Error(`No se pudo abrir ningún navegador para renovar la cookie. ${errors.join(" · ")}`);
  }
}

async function doRelogin(): Promise<boolean> {
  const login = await getLogin();
  if (!login) throw new Error("No hay credenciales de MarketSnack guardadas.");

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ userAgent: "Mozilla/5.0" });
    const page = await context.newPage();
    await page.goto("https://app.marketsnack.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.fill('input[name="email"]', login.email);
    await page.fill('input[name="password"]', login.password);
    await page.click('button[type="submit"]');

    // Espera a que se asiente la sesión (redirección o cookie con valor).
    await waitForSession(context, page);

    const cookies = await context.cookies("https://app.marketsnack.com");
    const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    if (!header.includes("_market_snack_session=")) return false;

    // OJO: Rails pone la cookie de sesión incluso para anónimos. La cookie SOLO
    // vale si autentica de verdad → validar ANTES de guardar (no pisar una buena).
    if (!(await validateMarketsnackCookie(header))) return false;
    await setMarketsnackCookie(header);
    return true;
  } finally {
    await browser.close();
  }
}

async function waitForSession(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page
): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const cookies = await context.cookies("https://app.marketsnack.com");
    const sess = cookies.find((c) => c.name === "_market_snack_session" && c.value.length > 10);
    if (sess && !page.url().includes("/login")) return true;
    if (sess && i > 6) return true; // a veces no redirige, pero la sesión ya existe
    await page.waitForTimeout(500);
  }
  return false;
}
