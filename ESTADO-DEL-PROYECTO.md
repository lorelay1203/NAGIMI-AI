# 📊 Nagimi AI — Estado del Proyecto

_Resumen completo. Última actualización: 2026-07-30. Material educativo, no es consejo financiero._

Ruta del proyecto: `C:\Users\lorel\OneDrive\Escritorio\Nagimi AI\1 - App Opciones (localhost 3000)\`
App web (Next.js): subcarpeta `web\` · corre en `http://localhost:3000`

---

## 1. Qué es
Agente multi-agente de **análisis de options flow**: busca un ticker y arma un scorecard (0-100),
niveles de GEX (muros, imán), escenarios de precio, Time & Sales, checklist de disciplina y un
Order Builder de estrategias. **Prepara** operaciones; **no las ejecuta** (eso lo hace la usuaria).

---

## 2. Lo construido

### Análisis (los 6 sub-agentes → scorecard 0-100)
1. Agresividad · 2. Convicción · 3. Inusualidad · 4. Estructura · 5. Contexto IV · 6. Confirmación de precio.
- **Prediction Pro:** 3 escenarios (bajista/base/alcista) con target, % y probabilidad.
- **Vistas:** 👤 Estudiante (simple) y ⚡ Pro (completa).

### GEX (Gamma Exposure)
- **Tarjeta "GEX en vivo":** call/put wall, imán, gamma flip, max pain — **datos REALES de MarketSnack**, ahora como **gráfica** (precio intradía + muros).
- **Gráfica de barras por strike:** GEX con **gamma REAL** de MarketSnack (fallback a estimado/Tradier).
- **Strike Walls, probabilidad y ruta esperada:** ahora usa el GEX real (arreglado — antes salía en ceros cuando faltaban velas).

### Otras piezas de la UI
- **Time & Sales** (`/flow`) coloreado: 🟢 Entrada / 🔴 Salida / 🟡 Hedge (inferido por vol vs OI).
- **Checklist del trade** dinámico y explicado en simple (usa niveles reales de GEX).
- **Order Builder + Estrategias:** Single, Vertical (débito), Venta de prima (crédito), Butterfly, Condor, Iron Condor.
  - Botón **🎯 Sugerir según mi cuenta** (elige strike/ancho/vencimiento que quepan) y **💲 Traer precios reales** (bid/ask/mid de la cadena).
  - Muestra **ganancia máxima, pérdida máxima, break-evens, probabilidad de ganancia (por IV) y ajustada** por la lectura de los agentes, y % de la cuenta.
  - **Curva gráfica de ganancia/pérdida al vencimiento** (SVG): zona verde/roja, break-evens, strikes y el precio actual marcados. (`app/components/PayoffChart.tsx`)
- **📡 Radar de flujo (descubrimiento):** escanea el flujo de opciones de TODO el mercado (MarketSnack `market_big_delta_trades`), agrega por acción y muestra dirección (calls vs puts), excluyendo mega-caps/ETFs para resaltar acciones nuevas o poco famosas. Clic en un ticker lo analiza. (`app/components/RadarCard.tsx`, `app/api/radar/route.ts`)
- **🎯 Tabla de recomendaciones:** capturas tu capital por broker (se guarda) y arma ideas de corto/largo plazo (dirección + muros GEX), con strikes, vencimiento, riesgo por contrato, en qué broker cabe y señal Entrar/Esperar/Evitar. Primas estimadas por Black-Scholes. (`app/components/RecomendacionesCard.tsx`, `lib/recommend.ts`)
- **Líneas de strikes para TradingView** (Pine Script en `AGENTE NAGIMI OPCIONES\NagimiMurosDeStrikes.pine`).

### Conexiones / brokers
- **Schwab (thinkorswim):** conexión OAuth oficial de **solo lectura** (cuenta + posiciones) en `/schwab`.
- **Order Builder** prepara la orden; la ejecución la hace la usuaria en su broker (Schwab/Robinhood/Webull).

### Infraestructura / experiencia
- Tema **negro** en toda la app.
- Botones de Escritorio: 🚀 **Abrir Nagimi AI**, 🔄 **Reiniciar Nagimi AI**.
- Guías: `GUIA-DE-USO.md`, `RECOMENDACIONES-ACTUALIZACIONES.md`, `LEEME.md` (carpeta madre).
- **Túnel web** (Cloudflare) para exponer la app con URL pública temporal.

---

## 3. Fuentes de datos y llaves (`web\.env.local`)
| Llave | Para qué | Estado |
|-------|----------|--------|
| `MASSIVE_API_KEY` | Cadena de opciones, velas | ✅ válida (plan con Options Snapshot) |
| `FINNHUB_API_KEY` | Precio en vivo | ✅ válida |
| `MARKETSNACK_COOKIE` | Time & Sales + GEX + cadena con griegos | ✅ funciona, ⚠️ **caduca cada pocas horas** |
| `TRADIER_API_KEY` (+ `TRADIER_SANDBOX`) | Respaldo GEX + pruebas de órdenes | ⏳ pendiente (falta token sandbox) |
| `QUANTDATA_TOKEN` | (evaluado como respaldo GEX) | ⚠️ token válido, pero **NO cableado**: su API es por-widget (uuid), no por-ticker → no sirve de respaldo automático |
| `SCHWAB_CLIENT_ID` / `SCHWAB_CLIENT_SECRET` | Trading API oficial (solo lectura) | ✅ conectado |

---

## 4. Lo que FUNCIONA (probado 2026-07-28 con SPY)
- ✅ Velas (Massive): 251
- ✅ Cadena (Massive): 10,000 contratos
- ✅ Precio en vivo (Finnhub): $737.17 (+1.06%)
- ✅ Time & Sales (MarketSnack): 100 trades
- ✅ GEX niveles (MarketSnack): imán $733 · call wall $740 · put wall $733
- ✅ GEX real por strike: 203 strikes
- ✅ Sugerir contrato: strike $735, mid $1.06
- ✅ Sugerir estrategia: centro $735, ancho $4
- ✅ Schwab (solo lectura): 2 cuentas conectadas
- ⏳ Tradier: sin token (respaldo, opcional)

**Conclusión: el motor está prácticamente completo y operativo.**

---

## 5. Lo que FALTA / pendientes
1. **Cookie de MarketSnack caduca** → hay que renovarla manualmente (ver GUIA-DE-USO). Es la fragilidad #1.
2. **Tradier (respaldo GEX):** falta pegar el **Sandbox Access Token** de developer.tradier.com. Con eso, si MarketSnack cae, el GEX sigue vivo.
3. **Fase 2 de órdenes (enviar):** bloqueada por seguridad — Nagimi **solo prepara** la orden; NO la envía. (Robinhood lanzó "Agentic Trading" oficial vía MCP, hoy solo acciones; opciones vendrán después.)
4. **URL fija / web permanente:** requiere un **dominio** (~$10/año) + deploy real en Vercel (con base de datos, porque Vercel no guarda archivos). Hoy solo hay túnel temporal (PC encendido).
5. **Producto multi-usuario para vender:** la app está hecha para 1 usuaria con sus llaves. Vender a muchos = fase mayor (cada quien con sus llaves o plan compartido + cobros).
6. **Navegador headless:** la búsqueda a veces no dispara al automatizar; en Chrome real funciona bien.
7. ~~Payoff gráfico en el Order Builder~~ ✅ **HECHO 2026-07-30** (curva SVG con zonas verde/roja, break-evens y spot).

---

## 6. Próximos pasos (priorizados)
1. **Usar y validar** la app en el Chrome real (buscar varios tickers, revisar cada sección).
2. **Conseguir el token sandbox de Tradier** → respaldo de GEX estable + probar órdenes con dinero falso.
3. Cuando se venda/muestre: **URL fija** (comprar dominio `nagimiai.com` u otro + Vercel).
4. **Renovar cookie de MarketSnack** cuando caduque (proceso en GUIA-DE-USO).
5. (Fase mayor) Convertirla en producto multi-usuario para vender.

---

## 7. Cómo operarla (rápido)
- **Arrancar:** doble clic en 🚀 **Abrir Nagimi AI** (o `cd web` → `npm run dev` → localhost:3000).
- **Tras cambiar la cookie/env:** doble clic en 🔄 **Reiniciar Nagimi AI**.
- **Llaves:** todas en `web\.env.local` (nunca compartir ese archivo).
- **Datos que se guardan** (memoria/predicciones/cadena/tokens): carpeta `web\data\` (por eso el deploy gratis necesitaría base de datos).

_Fin del resumen._
