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
    console.error("[MS-LOGIN] página cargada:", page.url(), "| email?", !!emailEl, "| pass?", !!passEl);
    if (!emailEl || !passEl) {
      throw new Error("No se encontró el formulario de login de MarketSnack (¿cambió la página?).");
    }
    // Escribir tecla por tecla (React a veces ignora el fill directo).
    await emailEl.click();
    await emailEl.fill("");
    await emailEl.pressSequentially(login.email, { delay: 25 });
    await passEl.click();
    await passEl.fill("");
    await passEl.pressSequentially(login.password, { delay: 25 });
    await page.waitForTimeout(300);
    const eVal = await emailEl.inputValue().catch(() => "");
    const pLen = (await passEl.inputValue().catch(() => "")).length;
    console.error("[MS-LOGIN] campos llenos → email:", eVal, "| largo contraseña:", pLen);
    // SOLO clic en el botón "Log in" (corre el handler JS real). NO usar Enter ni
    // submit nativo: eso hace un GET que recarga /login con los datos en la URL y
    // borra los campos (por eso antes nunca entraba, aunque la contraseña fuera buena).
    const btn = page.getByRole("button", { name: /^\s*log in\s*$/i }).first();
    await btn.click({ timeout: 8000 }).catch(async () => {
      await page.locator('button:has-text("Log in")').first().click({ timeout: 5000 }).catch(() => {});
    });
    console.error("[MS-LOGIN] clic en Log in enviado");
    await page.waitForTimeout(3500);

    // Espera a que se asiente la sesión (redirección o cookie con valor).
    await waitForSession(context, page);
    // Captura cualquier mensaje de error que MarketSnack muestre (contraseña mala, etc.)
    await page.waitForTimeout(1000);
    const errText = await page.locator('[class*="error" i], [role="alert"], .text-red-500, [class*="invalid" i]').first().innerText().catch(() => "");
    if (errText) console.error("[MS-LOGIN] MENSAJE DE ERROR de MarketSnack:", errText.slice(0, 120));

    // Diagnóstico: dónde quedó y si hay mensaje de error visible en la página.
    const finalUrl = page.url();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const btnTexts = await page.locator("button").allInnerTexts().catch(() => []);
    console.error("[MS-LOGIN] tras submit → url:", finalUrl);
    console.error("[MS-LOGIN] BOTONES en pantalla:", JSON.stringify(btnTexts.slice(0, 8)));
    console.error("[MS-LOGIN] TEXTO de la página (300):", bodyText.replace(/\s+/g, " ").slice(0, 300));

    const cookies = await context.cookies("https://app.marketsnack.com");
    const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const hasSess = header.includes("_market_snack_session=");
    console.error("[MS-LOGIN] cookie de sesión presente?", hasSess);
    if (!hasSess) return false;

    // OJO: Rails pone la cookie de sesión incluso para anónimos. La cookie SOLO
    // vale si autentica de verdad → validar ANTES de guardar (no pisar una buena).
    const valid = await validateMarketsnackCookie(header);
    console.error("[MS-LOGIN] cookie válida (autentica)?", valid);
    if (!valid) return false;
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
