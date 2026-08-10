# 📘 Guía de uso — Nagimi AI (sin depender de Claude)

Todo esto lo puedes hacer **tú sola**. Claude solo se usó para *construir* la app; para *usarla* solo necesitas esta guía.

---

## ✅ Lo único que necesitas instalado
- **Node.js** (ya está instalado en tu PC).
- La carpeta `Nagimi AI\1 - App Opciones (localhost 3000)` (ya está).
- Las 3 credenciales en el archivo `.env.local` (ya están; solo la cookie se renueva).

---

## ▶️ 1. Cómo ABRIR la app (cada día)

**La forma fácil:** doble clic en el ícono del Escritorio:
> 🚀 **Abrir Nagimi AI (Opciones)**

Eso arranca el motor y abre el navegador solo. Espera ~15 segundos la primera vez.

**Si el ícono no funciona (forma manual):**
1. Abre la carpeta `Nagimi AI\1 - App Opciones (localhost 3000)\web`
2. En la barra de dirección escribe `powershell` y Enter (abre una terminal ahí).
3. Escribe: `npm run dev` y Enter.
4. Abre el navegador en **http://localhost:3000**

---

## 🔎 2. Cómo USARLA
1. Escribe un **ticker** (ej. `SPY`, `INTC`, `NBIS`) en el buscador de arriba.
2. Pulsa **Enter**.
3. Lee el **Veredicto**, los **escenarios**, los **muros** y el **GEX**.
4. Cambia entre **👤 Estudiante** (simple) y **⚡ Pro** (completo) arriba.

---

## 🍪 3. EL PROBLEMA #1 — La cookie de MarketSnack (¡lo más importante!)

MarketSnack **caduca cada pocas horas**. Cuando eso pasa, verás:
- El aviso *"Sesión de MarketSnack inválida o expirada"*, o
- Los estimados en **ceros** / el aviso *"datos no fiables"*.

**No es un error: es que hay que renovar la cookie. Así lo haces TÚ SOLA:**

1. Abre **app.marketsnack.com** en Chrome (asegúrate de estar **con sesión iniciada** — que veas datos).
2. Pulsa **F12** → pestaña **Network**.
3. Recarga la página (**F5**).
4. En el filtro escribe **`flow_feed`** y haz clic en esa petición.
   - Debe decir **Status 200** (verde). Si dice 401/rojo → **cierra sesión y vuelve a entrar** primero.
5. **Clic derecho** sobre `flow_feed` → **Copy** → **Copy request headers**.
6. Pega eso en el Bloc de notas, busca la línea que empieza con **`Cookie:`**, y copia **TODO** lo que va después de `Cookie: ` (es larguísimo, ~2000 caracteres).
7. Abre el archivo:
   `Nagimi AI\1 - App Opciones (localhost 3000)\web\.env.local`
   (ábrelo con el **Bloc de notas**).
8. Busca la línea `MARKETSNACK_COOKIE=` → **borra lo viejo** y pega la cookie nueva (todo en **una sola línea**). Guarda.
9. Doble clic en el ícono del Escritorio: 🔄 **Reiniciar Nagimi AI**
10. Espera a que abra y busca un ticker. Ya debería funcionar.

> 💡 Truco: hazlo **rápido** (copiar → pegar → guardar → reiniciar en menos de 1 minuto), porque la cookie se vence pronto.

---

## 🔄 4. Los dos botones del Escritorio
- 🚀 **Abrir Nagimi AI (Opciones)** → arranca la app y abre el navegador.
- 🔄 **Reiniciar Nagimi AI** → cierra y vuelve a arrancar (úsalo **después de cambiar la cookie**).

---

## 🔑 5. Dónde están las llaves (credenciales)
Archivo: `Nagimi AI\1 - App Opciones (localhost 3000)\web\.env.local`

| Llave | Para qué | ¿Se renueva? |
|-------|----------|--------------|
| `MASSIVE_API_KEY` | Cadena de opciones, velas | No (es fija, de pago) |
| `MARKETSNACK_COOKIE` | Time & Sales + GEX real | **SÍ, cada pocas horas** (ver punto 3) |
| `FINNHUB_API_KEY` | Precio en vivo | No (gratis) |

⚠️ Nunca compartas este archivo — tiene tus credenciales.

---

## 🩺 6. Solución rápida de problemas

| Lo que ves | Qué significa | Qué hacer |
|-----------|----------------|-----------|
| Estimados en $0.00 / "no fiable" | Cookie de MarketSnack vencida | Renovar cookie (punto 3) |
| "Sesión de MarketSnack inválida" | Igual | Renovar cookie |
| La página no abre (localhost no responde) | El motor no está corriendo | Doble clic en 🔄 **Reiniciar Nagimi AI** |
| "Autenticación rechazada por Massive" | Key de Massive con problema | Revisar tu cuenta Massive / suscripción |
| Precio dice el cierre viejo, no en vivo | Finnhub sin key | Revisar `FINNHUB_API_KEY` en `.env.local` |

---

## 🖥️ 7. Cómo NO depender de Claude
- **Para usarla**: solo necesitas los 2 botones del Escritorio + renovar la cookie cuando venza. Nada más.
- **La app corre 100% en tu PC** (localhost). No necesita internet de Claude, solo tu conexión normal para los datos.
- Claude solo hace falta si quieres **cambiar o mejorar el código** (nuevas funciones, arreglos).

---

## 📡 8. Fuentes de datos (para el futuro)
- **Massive** — cadena de opciones y velas.
- **MarketSnack** — Time & Sales + **GEX real** (call/put wall, imán, gamma flip).
- **Finnhub** — precio en vivo.
- **Respaldos posibles** (si algún día quieres que no dependa solo de MarketSnack): **QuantData**, **Tradier** o **Unusual Whales** — dan flujo/griegos por API. Se pueden añadir como red de seguridad para que nunca salga todo en ceros.

_Material educativo. No es consejo financiero._
