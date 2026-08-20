# ESTADO_PROYECTO.md

**Última actualización:** 2026-08-06 · 16:52  
**Modo:** Construcción controlada (una función a la vez)

## 🎯 Motor Principal — ✅ FASE 1 VALIDADA (2026-08-06)
Las 4 fuentes funcionan end-to-end con INTC y SPY:
| Fuente | INTC | SPY |
|--------|------|-----|
| History (precio/barras) | ✓ | ✓ |
| GEX (gamma, muros) | +18.3M · 108/97 · $98.19 | −194M · 775/768 · $769.95 |
| Flow (time & sales) | 256 notables/690 | 278 notables/1188 |
| Predicción + memoria | error base 1.1% ✓ | tocó bull, error 4% ✓ |

- **Cookie MarketSnack:** válida
- **Memoria auto-correctiva:** viva (guarda predicciones, compara vs real)
- **Conclusión:** motor apto para construir encima.

## 🔎 Repositorio de origen
Es el ANCESTRO de Nagimi AI. Features que tu versión NO tiene:
- **/wheel** — screener de cash-secured puts (universo 40 tickers, score)
- **/ideas** — panel de riesgo/screener de mercado (mejorado 3-ago para cuenta chica)
- Nota: el .zip en Downloads es marcador de OneDrive (no descargado real)

## ✅ Completado
- Cookie MarketSnack (runtime `/api/marketsnack-cookie`)
- Radar de descubrimiento + Low-Cost Contracts
- Recomendaciones con Risk Gate (Black-Scholes)
- Selector de estrategia (6 tipos)
- Chat con Claude (sistema educativo)
- Soportes/resistencias → TradingView + thinkorswim
- Posiciones Schwab + manuales (P/L en vivo)
- **Pestañas (Análisis | Operar | Chat)** — implementadas, localStorage, estilos OK

## 🔌 Tastytrade (solo-lectura) — CONECTADO 2026-08-06
- `lib/tastytrade.ts` + `/api/tastytrade/connect` + `/api/tastytrade/accounts`
- OAuth2 grant personal; access token 15 min auto-renovado
- Credenciales en `data/tastytrade_creds.json` (local, en gitignore)
- Cuenta 5WY98695 (CASH, $0) — lee balance + posiciones ✓
- ⚠️ El grant tiene scope `read trade openid`. DECISIÓN usuaria (2026-08-06):
  dejarlo así. Candado real = el código NO tiene funciones de ejecución (solo
  GET de lectura). NO agregar endpoints de órdenes sin confirmación explícita.
- Falta: tarjeta UI (mostrar en Nagimi como Schwab). Aún no cableada a page.tsx.

## 📝 Paper Trading (validar motor sin dinero real) — EN PROGRESO
- **Función 1 ✅ (2026-08-06):** diario backend. `lib/paper.ts` + `/api/paper`
  (GET lista · POST open/close/delete). Archivo `data/paper_trades.json`.
  Soporta single y multi-leg (spreads). Probado open/list/delete OK.
- **Función 2 ✅ (2026-08-06):** tarjeta `PaperTradingCard.tsx` cableada en inicio.
  Marcador (aciertos % · P/L total · nº trades), abiertos con P/L en vivo (marca a
  mercado vía /api/quote), cerrar/borrar. Renderiza OK.
- **Función 3 ✅ (2026-08-06):** botón "📝 Registrar en papel" por fila en
  RecomendacionesCard. Cotiza entrada con /api/quote (comparable al P/L en vivo),
  POST /api/paper action:open. Typecheck limpio. Falta test E2E en navegador.
- Fix aplicado: caché `.next` corrupto daba CSS 404 ("no se ve bien") → borrado y
  reinicio limpio. Página vuelve a verse con estilos.
- Nota: el $100 en MARGEN aún muestra $0 (depósito probablemente en proceso de
  liquidar; refrescar más tarde). Radar: cookie MarketSnack vencida (renovar en 🍪).
- Contexto: usuaria depositó $100 real en cuenta MARGEN Tastytrade queriendo
  auto-trades. Acuerdo: paper primero; NADA real hasta que el motor demuestre
  que gana. Ejecución automática NO se construye (semi-auto con clic, más adelante).

## 🔌 Tastytrade — tarjeta UI ✅
- `TastytradeCard.tsx` cableada en page.tsx (inicio, junto a Mis Posiciones).
  Muestra valor neto, efectivo, poder de compra y posiciones. Solo lectura.

## 🍪 MarketSnack auto-login (Playwright) — EN PRUEBA
- Playwright + Chromium instalados. `next.config.mjs` → serverExternalPackages.
- `lib/marketsnackLogin.ts` (login headless → captura cookie → setMarketsnackCookie)
  + `/api/marketsnack-login` (GET status · POST guardar+login · POST relogin).
- UI: sección "🤖 Auto-renovar" en `/cookie` (email+pass → activar). Manual queda
  como alternativa. Credenciales en `data/marketsnack_login.json` (gitignore).
- ✅ PROBADO 2026-08-07: auto-login FUNCIONA. Usuaria lo activó con credenciales
  reales; `POST {action:relogin}` → {ok:true}, cookie válida. Playwright pasa la
  protección anti-bot sin problema. Bug corregido: valida ANTES de guardar (no
  pisa cookie buena con una anónima). Login POST va a /users/sign_in (Devise).
- ✅ AUTO-REINTENTO EN 401 CABLEADO Y PROBADO (2026-08-07): `lib/marketsnackFetch.ts`
  `msFetch()` inyecta cookie y, si 401/403/3xx + hay auto-login, re-loguea con
  Playwright y reintenta UNA vez. Enchufado en marketsnack.ts (flujo),
  marketsnackChain.ts (alias msFetchAuto, evita colisión), marketsnackGex.ts.
  PRUEBA: cookie corrompida a propósito → GEX SPY devolvió 200 y escribió cookie
  nueva (1239 chars) sola. MarketSnack ahora es 100% invisible. Motor completo.
- ✅ Panel "🔌 Conexiones" en /cookie: estado en vivo + caducidad + COSTO mensual
  de cada servicio (💰 MarketSnack y Massive = pago mensual; brokers = gratis;
  IA = por uso). `ConexionesCard.tsx`.

## 📓 Journaling ✅ (2026-08-07)
- `lib/journal.ts` + `/api/journal` (GET/add/delete) + `JournalCard.tsx` en inicio.
- Entradas con etiqueta (lección/error/idea/emoción/nota), ticker opcional, título,
  cuerpo. Guarda en `data/journal.json`. Probado add/list/delete OK.
- Distinto de Paper Trading (eso mide P/L; esto son reflexiones).

## 📅 Selector de vencimiento + Radar fix (2026-08-07)
- **Vencimiento en RecomendacionesCard**: al elegir estrategia concreta aparecen
  botones 0DTE/1sem/2sem/1mes. `buildStrategyIdea` acepta `dteOverride` (0 = hoy);
  width DTE-aware; expiry = hoy si 0DTE. `TradeIdea.plazo` ahora es `string`.
- **Radar arreglado**: leía cookie de `process.env` (ignoraba la runtime) y su
  `msFetch` local no re-logueaba. Ahora usa `getMarketsnackCookie()` + `msFetchAuto`
  (auto-relogin). Probado: cookie corrupta → /api/radar 200 solo.
- **Paper trades de estudio registrados (2026-08-07)**: INTC bull call 100/105 (BS,
  mercado cerrado) y SPY iron condor 0DTE 767/765p+776/778c (venta de prima, precios
  reales). En `data/paper_trades.json`.

## 🔬 Griegos + probabilidad detallados (2026-08-07)
- **Endpoint** `/api/contract` + `contractDetail()` en marketsnackChain.ts → detalle
  COMPLETO de un contrato: delta/gamma/theta/vega reales, precio+cambio%, bid/ask/mid,
  IV, volumen, OI, premium. (MarketSnack `option_chain_extended` sí trae los 4 griegos.)
- **`GreeksPanel.tsx`** integrado en OrderBuilder (bajo el resumen): tabla por pata
  (Δ Γ Θ Vega, precio, IV, Vol, OI) + fila NETO de la posición + leyenda explicativa.
  Vol 0 / OI<100 se marcan en color (aviso de liquidez). El OrderBuilder YA tenía
  PoP (por IV + ajustada), break-even, ganancia/pérdida máx.

## 💡 Feature /ideas portada del repositorio de origen (2026-08-07)
- Commit "feat(ideas): screener más accesible para cuenta chica" (3-ago) traído.
- **lib/risk.ts** (drop-in, depende solo de flow.ts que ya era compatible):
  passesQualityFilter · isTradeableIdea · withinMoneyness · sizeFlow · budgetsOf.
  Capa 1 = calidad (theta≤5%/día, DTE≥2, inusual, moneyness ±25%). Capa 2 = sizing
  (techo de contratos por prima Y quema de theta vs cuenta+tolerancia).
- **marketsnack.ts**: refactor a `paginate(symbol|null)` + nuevo `fetchMarketFlow()`
  (escaneo de TODO el mercado, sin filtro de símbolo) usando msFetch (auto-relogin).
- **app/api/ideas/route.ts** (SSE) + **app/ideas/types.ts** + **IdeasTable.tsx** copiados.
- **app/ideas/page.tsx** REESCRITO enfocado a cuenta chica (quité watchlist/navtabs
  del repo): input capital + tolerancia (0.5/1/1.5/2%) + horizonte, sizing en cliente
  (saldo nunca va al server). Link 💡 Ideas en HeaderBar.
- PROBADO: escaneó 400 ops/28 tickers → 60 ideas operables; rechazos por theta/venc/lejano OK.

## 🏦 Institutional Flow Intelligence (spec grande de la usuaria) — EN FASES
- **Fase 1 ✅ (2026-08-07):** `lib/institutionalFlow.ts` `analyzeInstitutionalFlow(FlowRow)`
  → Flow Score 0-100 (8 componentes: premium25/tamaño15/delta12/dte12/oi10/aggr10/repeat8/liq8)
  + grade A+..D, premium+estrellas, notional (size×100×spot), moneyness, delta read, DTE bucket
  (lotería/swing/institucional/LEAP), bid/ask read (aggression), OI intelligence (flags.exceededOI),
  smart money %, bull/bear %, lenguaje simple, "por qué importa" (✔ + ⚠ honesto), recom
  WATCH/HIGH CONVICTION/WAIT/IGNORE. PROBADO: ejemplo spec INTC LEAP $8.3M → 96 A+, $30M, HIGH CONVICTION.
- **Fase 2 ✅ (2026-08-07):** `InstitutionalCard.tsx` — Flow Score grande + grade + chip de
  recomendación, desglose plegable de los 8 componentes (barras), Smart Money %, barra
  bull/bear, las 7 lecturas en grid (premium+estrellas, tamaño→acciones→notional, moneyness,
  delta, DTE, bid/ask, OI), "¿Qué significa?" en simple y "📌 ¿Por qué importa?" (✔ + ⚠ + acción).
  ENGANCHE: `UnusualityCard` acepta `onPick` → filas clicables (🏦, cursor pointer) → page.tsx
  guarda `instRow` y renderiza la tarjeta en la vista Pro sobre TradesFeed. TS 0.
- **Fase 3:** detección entre-trades (cluster, ladder, multi-exp, hedge).
- **Honesto - sin datos:** checklist técnico (VWAP/EMA/ATR/dark pool/tape), sweeps multi-exchange →
  se marca "⚠ falta confirmar", no se inventa. ML recalibración = fase futura.

## 💡 /ideas: filtro por ticker (2026-08-07)
- `/api/ideas?ticker=X` → escanea SOLO ese ticker (fetchFlow) con piso premium $25k;
  sin ticker = todo el mercado (fetchMarketFlow, $100k). page.tsx: buscador manual +
  botón "Todo el mercado" + chips de filtro de los tickers que salieron (shownRows).
  Probado: ?ticker=SPY → 60 ideas todas SPY.
- Fix Playwright: el binario `chrome-headless-shell` se había descargado incompleto →
  radar/auto-login daban "Executable doesn't exist". `npx playwright install chromium`
  + REINICIAR dev server (el proceso viejo cacheaba la instalación rota). Radar OK.

## ✅ recommend.ts LIMPIO (2026-08-07)
- Arreglados los 2 errores pre-existentes: `hitRate?` agregado a RecoInput; y
  `maxRiskPct/suggestedContracts/suggestedRisk` agregados al return de sizeReco.
- **Proyecto entero typechea limpio (TS_EXIT 0), cero errores.**

## 📋 Próximo Paso
Fase 1 ✅ cerrada. Opciones desbloqueadas:
- Portar **/ideas** (panel de riesgo, cuenta chica) del repo
- Portar **/wheel** (screener venta de puts)
- Cookie automática (login headless — integración nueva)
- Semi-auto de órdenes (fase 4: app arma, usuaria aprueba)

---

## Cambios Recientes
| Archivo | Cambio | Resultado |
|---------|--------|-----------|
| `app/page.tsx` | Persistencia de pestaña en localStorage (useEffect) | ✅ Pestaña se guarda |
| `globals.css` | Estilos `.section-tabs` ya presentes | ✅ Botones visibles y funcionales |
