// Auto-login de MarketSnack con navegador headless (Playwright).
// Inicia sesión como un humano, captura la cookie de sesión y la guarda con
// setMarketsnackCookie(). Se usa para renovar la cookie SOLA cuando caduca.
// Credenciales: data/marketsnack_login.json (local, en .gitignore). Sin ejecución.
//
// Reactivado 2026-08-18 con autorización de la usuaria. Incluye un CANDADO de
// enfriamiento: no reloguea más de una vez cada COOLDOWN_MS, para no crear una
// tormenta de logins que la saque de su propia sesión a cada rato.

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

/** Borra las credenciales guardadas (apaga el auto-login). */
export async function clearLogin(): Promise<void> {
  await fs.rm(LOGIN_FILE, { force: true });
}

// Evita abrir varios navegadores a la vez si llegan muchos 401 juntos.
let inFlight: Promise<boolean> | null = null;
// Candado de enfriamiento: no reloguear otra vez antes de que pasen estos ms.
const COOLDOWN_MS = 90_000;
let lastAttempt = 0;

/** Inicia sesión headless y guarda la cookie fresca. Devuelve true si funcionó. */
export async function reloginMarketsnack(force = false): Promise<boolean> {
  if (inFlight) return inFlight;
  const since = Date.now() - lastAttempt;
  if (!force && since < COOLDOWN_MS) return false; // aún en enfriamiento
  lastAttempt = Date.now();
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
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" });
    const page = await context.newPage();
    // La página de login es una app JS: hay que esperar a que el formulario se dibuje.
    await page.goto("https://app.marketsnack.com/login", { waitUntil: "networkidle", timeout: 45000 });

    // Busca el campo de correo probando varios selectores (por si cambió el nombre).
    const emailEl = await firstVisible(page, [
      'input[name="email"]', 'input[type="email"]',
      'input[autocomplete="email"]', 'input[autocomplete="username"]',
      'input[placeholder*="mail" i]', 'input[id*="email" i]',
    ]);
    const passEl = await firstVisible(page, [
      'input[name="password"]', 'input[type="password"]',
      'input[autocomplete="current-password"]', 'input[placeholder*="pass" i]',
    ]);
    if (!emailEl || !passEl) {
      throw new Error("No se encontró el formulario de login de MarketSnack (¿cambió la página?).");
    }
    // MarketSnack ahora muestra popups de marketing (Amplitude "engagement nudge")
    // que TAPAN el formulario e interceptan los clics. Los quitamos del DOM antes
    // de interactuar (y de nuevo antes de enviar) para que el login no se trabe.
    await dismissOverlays(page);
    // React controla los inputs: hay que setear el valor con el SETTER NATIVO y
    // disparar los eventos que React escucha; si no, el handler de "Log in" lee
    // los campos vacíos y no autentica (aunque en pantalla se vean llenos).
    const reactType = async (el: import("playwright").Locator, val: string) => {
      await el.click({ force: true }); // force: por si un overlay resurge
      await el.pressSequentially(val, { delay: 15 });
      await el.evaluate((node, v) => {
        const proto = Object.getPrototypeOf(node);
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(node, v);
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      }, val);
    };
    await reactType(emailEl, login.email);
    await reactType(passEl, login.password);
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    // SOLO clic en el botón "Log in" (corre el handler JS real). NO usar Enter ni
    // submit nativo: eso hace un GET que recarga /login y borra los campos.
    const btn = page.getByRole("button", { name: /^\s*log in\s*$/i }).first();
    await btn.click({ timeout: 8000, force: true }).catch(async () => {
      await page.locator('button:has-text("Log in")').first().click({ timeout: 5000, force: true }).catch(() => {});
    });
    await page.waitForTimeout(3000);

    // Espera a que se asiente la sesión (redirección o cookie con valor).
    await waitForSession(context, page);

    const cookies = await context.cookies("https://app.marketsnack.com");
    const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    if (!header.includes("_market_snack_session=")) return false;
    // La cookie de Rails existe incluso para anónimos → validar que autentique de verdad.
    if (!(await validateMarketsnackCookie(header))) return false;
    await setMarketsnackCookie(header);
    return true;
  } finally {
    await browser.close();
  }
}

/** Devuelve el primer selector que se vuelve VISIBLE, probándolos en orden. */
async function firstVisible(
  page: import("playwright").Page,
  selectors: string[],
  timeoutEach = 5000,
): Promise<import("playwright").Locator | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: timeoutEach });
      return loc;
    } catch { /* prueba el siguiente selector */ }
  }
  return null;
}

/** Quita los popups de marketing (Amplitude "engagement nudge") que tapan el login. */
async function dismissOverlays(page: import("playwright").Page): Promise<void> {
  try {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      const sels = [
        ".rc-dialog-wrap", ".rc-dialog-mask", "#engagement-wrapper",
        ".amplitude-engagement-modal-container", '[class*="engagement"]', '[class*="nudge"]',
      ];
      for (const s of sels) document.querySelectorAll(s).forEach((el) => el.remove());
      document.body.style.overflow = ""; // por si el modal bloqueó el scroll
    }).catch(() => {});
  } catch { /* si falla, los clics usan force:true de respaldo */ }
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
