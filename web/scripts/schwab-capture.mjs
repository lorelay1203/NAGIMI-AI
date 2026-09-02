// ============================================================================
// Captador del retorno de Schwab (OAuth) para reconectar tu cuenta.
//
// El problema que resuelve: el código que devuelve Schwab caduca en ~30 segundos.
// Copiarlo y pegarlo a mano casi nunca llega a tiempo. Este servidor lo recibe
// y lo canjea al instante.
//
// Cómo se usa:
//   1) node scripts/schwab-capture.mjs      (déjalo abierto)
//   2) Abre el enlace que imprime e inicia sesión en Schwab.
//   3) Al terminar, Schwab te manda de vuelta aquí y la conexión queda hecha.
//
// El navegador avisará de que el certificado no es de confianza: es normal,
// el certificado se genera aquí mismo para tu propio ordenador. Acepta y sigue.
//
// Solo lectura de cuentas: no envía órdenes ni mueve dinero.
// ============================================================================

import https from "node:https";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = path.join(WEB, "certs");
const KEY_FILE = path.join(CERT_DIR, "schwab-key.pem");
const CRT_FILE = path.join(CERT_DIR, "schwab-cert.pem");
const PORT = 8182;
const APP = process.env.NAGIMI_URL || "http://localhost:3000";

const log = (...a) => console.log("·", ...a);

/** Certificado propio para 127.0.0.1. Se crea una vez y se reutiliza. */
function asegurarCertificado() {
  if (existsSync(KEY_FILE) && existsSync(CRT_FILE)) return;
  mkdirSync(CERT_DIR, { recursive: true });
  log("Generando certificado local (solo la primera vez)…");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", KEY_FILE, "-out", CRT_FILE, "-days", "3650",
    "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ], { stdio: "pipe" });
  log("Certificado listo.");
}

/** Pide a la app el enlace de autorización de Schwab. */
async function enlaceDeAutorizacion() {
  const r = await fetch(`${APP}/api/schwab/authurl`);
  const j = await r.json();
  if (!r.ok || !j.url) throw new Error(j.error || `la app respondió ${r.status}`);
  return j.url;
}

/** Entrega la URL de retorno a la app, que canjea el código por los tokens. */
async function canjear(urlCompleta) {
  const r = await fetch(`${APP}/api/schwab/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect: urlCompleta }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `la app respondió ${r.status}`);
  return j;
}

asegurarCertificado();

const server = https.createServer(
  { key: readFileSync(KEY_FILE), cert: readFileSync(CRT_FILE) },
  async (req, res) => {
    const urlCompleta = `https://127.0.0.1:${PORT}${req.url}`;
    if (!req.url?.includes("code=")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2>Esperando el retorno de Schwab…</h2><p>Puedes cerrar esta pestaña.</p>");
      return;
    }
    log("Retorno recibido. Canjeando el código…");
    try {
      await canjear(urlCompleta);
      log("✅ Schwab reconectado. Ya puedes cerrar esta ventana (Ctrl+C).");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2>✅ Schwab reconectado</h2><p>Ya puedes cerrar esta pestaña y volver a Nagimi.</p>");
    } catch (e) {
      log("❌ No se pudo canjear:", e.message);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>❌ No se pudo conectar</h2><p>${e.message}</p><p>Vuelve a intentarlo: los códigos caducan en segundos.</p>`);
    }
  },
);

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`\n  Servidor de reconexión escuchando en https://127.0.0.1:${PORT}\n`);
  try {
    const url = await enlaceDeAutorizacion();
    console.log("  ABRE ESTE ENLACE E INICIA SESIÓN EN SCHWAB:\n");
    console.log("  " + url + "\n");
    console.log("  (El navegador avisará del certificado: es tuyo, acepta y continúa.)\n");
  } catch (e) {
    console.log(`  ⚠️  No pude pedirle el enlace a la app (${e.message}).`);
    console.log(`     ¿Está Nagimi corriendo en ${APP}?\n`);
  }
});
