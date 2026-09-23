# Aetheris / FinAnalista — captura del 22-sep-2026

Segunda captura (la primera, del 10-sep, está en `aetheris-referencia.md` y cubre
la **anatomía de un reporte**). Esta cubre **las otras cuatro pestañas** y, sobre
todo, la pantalla de resultado de Proyecciones, que es la que Lorelay quiso
copiar "físicamente".

El acceso de Lorelay a Aetheris se acaba la semana del 29-sep-2026. Todo lo que
está aquí es para construir sin depender de volver a mirar la página.

---

## 1. Panel (`/dashboard`)

Orden exacto de arriba abajo:

1. **Barra superior**: título de sección + chip BETA · buscador a la derecha
   ("Ve a un ticker, un agente, un reporte…" con atajo ⌘K) · campanita
   ("Notificaciones — próximamente") · botón de panel de agentes.
2. **Portada centrada**: etiqueta pequeña `EQUITY RESEARCH · LIVE` · titular en
   serif a dos líneas, con la segunda mitad en itálica · una línea de qué hace.
3. **"¿Qué te gustaría analizar?"** + subtítulo + buscador ancho + fila
   `Prueba: AAPL · TSLA · NVDA · BTC`.
4. **Tabla "Your research"** — "5 recent reports · thesis table with live quotes",
   con enlace "View all →". Columnas:
   `TICKER · SEÑAL · 1Y TREND · SPOT · Δ TODAY · BEAR / BASE / BULL · CONV.`
   - Ticker: logo, símbolo grande en serif, chip "Proyecciones", nombre de la empresa debajo.
   - Señal: píldora `▲ Bullish` / `– Neutral` / `▼ Bearish` con color.
   - 1Y Trend: minigráfica de línea, verde o roja.
   - Bear/Base/Bull: barra de gradiente rojo→dorado→verde con un punto blanco en
     el precio actual y las tres cifras debajo.
   - Conv.: número 0-100 con una rayita dorada debajo.
5. Nada más. La página termina en la tabla.

> **En Nagimi:** copiado el 22-sep. Diferencias a propósito: la barra de rango usa
> el canal de gamma de HOY (suelo → techo, imán marcado) en vez de escenarios de
> un reporte viejo, y los tickers son los de su watchlist.

---

## 2. Proyecciones (`/projections`)

### Estado vacío
- Etiqueta `LABORATORIO DE PROYECCIONES` + titular *"Busca una empresa. Mapea el
  siguiente movimiento."*
- Párrafo: "Projection reads use option-chain pressure, GEX, strike walls, and
  expected-move cones. The page shows bullish, neutral, and bearish perspectives
  instead of raw option-chain tables."
- Tarjeta lateral "Primera versión — construido como su propio espacio para
  seguir mejorando la calidad de las proyecciones".
- Bloque **"Ejecutar proyecciones"**: chip con el DTE elegido (ej. `1-5 DTE`),
  buscador, botón "Ejecutar proyección", fila `Prueba: NVDA TSLA AAPL PLTR HOOD IREN`.
- **Tres tarjetas de horizonte**:
  | | Nombre | Ventana | Qué mira |
  |---|---|---|---|
  | **5D** | Táctico | 1-5 DTE | "Near-term dealer pressure and fast gamma shifts." |
  | **30D** | Swing | 15-30 DTE | "Monthly options pressure around nearby expirations." |
  | **90D** | Posición | 60-120 DTE | "Medium-term term-structure pressure and expected move cone." |
- Tres pasos: **1. Search** (elige símbolo) · **2. Select horizon** (cada horizonte
  es una ventana de expiración distinta) · **3. Interpret** ("Lee la trayectoria
  base, el cono de una desviación estándar y los porcentajes por escenario").

### Pantalla de resultado (lo importante) — capturada con NVDA
Se abre **a pantalla completa encima de la página**, con:

- **Barra superior**: etiqueta `AGENTE DE OPCIONES IA` · `NVDA $228.15 -0.31%` ·
  `Latest candle · 9/22/2026` · chips de marco de tiempo `5D / 5M`, `30D / 30M`,
  `3M / 1D` · botones `Projections` y `Support / Resistance` · X para cerrar.
- **Gráfico de velas grande** (TradingView) con, encima:
  - líneas horizontales punteadas en cada nivel, con etiqueta en el eje derecho
    (`Support 225`, resistencias, etc.) y una banda dorada sobre el soporte activo;
  - etiqueta `Spot 228.15` sobre el eje;
  - a la derecha de la última vela, **dos conos hacia adelante**: dorado (1σ) y
    azul (2σ), más una **línea de trayectoria base** amarilla;
  - título dentro del gráfico: "NVDA projection map" y el marco activo.
- **Leyenda de chips abajo**: `Spot 228.15` · `S 225 • 1d` · `R 230 • 1d/3d` ·
  `S 220 • 3d` · `Max pain 195.00` · `Gold cone 1σ expected move` ·
  `Blue cone 2σ stress range`.
- **Panel derecho** (tres bloques):
  1. `LECTURA DE PROYECCIÓN` → número grande **226** + "6mo base path from options pressure".
  2. `PROBABILIDADES POR ESCENARIO` → tres cajas con barra de progreso:
     - **Bullish 40%** · "Target area $236" · *"Positive GEX is leading this DTE
       window and the base path is drifting toward the upper band."*
     - **Neutral 37%** · "Target area $226" · *"Neutral is the GEX pin/mean-reversion
       case around the model base path."*
     - **Bearish 23%** · "Target area $216" · *"Bearish is the lower-probability case
       because positive GEX and the base path lean higher."*
     → **Suman 100%**: es reparto del precio final, no probabilidad de tocar.
  3. `CONO DE MOVIMIENTO ESPERADO` → tres píldoras `1σ low 216 · Base 226 · 1σ high 236`
     + barra `2σ stress range 206 - 247`.
  4. Al final, "¿Te resultó útil?" con pulgares.

> **En Nagimi:** copiado el 22-sep en `/proyecciones` + `ProyeccionMapa.tsx`.
> El reparto por escenario se calcula con la lognormal del cono
> (`lib/escenariosProb.ts`), no con la probabilidad de tocar, para que sume 100
> igual que allá. Añadido lo que allá no está: de qué fuente salió cada dato, el
> régimen de gamma explicado y el aviso de confianza recortada.

---

## 3. Agentes (`/agents`) — **todo en "coming soon"**

Titular: *"El espacio de agentes está coming soon."* · "This module is a beta
preview while we finish orchestration, fact lookup, controls, and run history."
Botones muertos: "Registros próximamente", "Nuevos agentes pronto".

Fila de vista previa con 7 módulos y una señal de adorno:
`FND Fundamentales (Bullish) · TCH Técnicos (Bullish) · SNT Sentimiento (Bullish) ·
RSK Riesgo (Neutral) · MAC Macro (Cautious) · SUP Cadena de suministro (Bullish) ·
GOV Gobernanza (Bullish)`

Cada tarjeta trae `MÓDULO: Beta · CONTROLES: Pronto · DATOS: Vista previa`, y
debajo el **ROL PLANEADO** (esto es lo que vale):

| Código | Agente | Qué dice que hará |
|---|---|---|
| **FND** | Fundamentales — "Lee reportes 10-K/Q y construye DCF y múltiplos comparables." | conectar filings y fundamentales · separar hechos de supuestos · publicar notas de valoración · vigilar la calidad de la fuente |
| **TCH** | Técnicos — "Patrones, régimen, volatilidad y momentum." | cablear señales de régimen de precio · normalizar entradas de momentum · añadir control de marcos de tiempo · explicar niveles de invalidación |
| **SNT** | Sentimiento — "Noticias, transcripciones, redes y tono de analistas." | búsqueda de noticias verificada · resumir el tono de las transcripciones · marcar fuentes viejas · puntuar fiabilidad de la fuente |
| **RSK** | Riesgo — "Superficie de volatilidad, riesgo de cola y exposición a factores." | modelar exposición a factores · añadir escenarios a la baja · sacar riesgos de liquidez · explicar los límites de la confianza |
| **MAC** | Macro — "Tasas, divisas, materias primas y pronósticos de régimen." | conectar contexto de tasas y divisas · mapear presión macro a sectores · notas de régimen · evidencia con fecha |
| **SUP** | Cadena de suministro — "Salud de proveedores, geopolítica y logística." | mapear proveedores y clientes · vigilar riesgo logístico · marcar concentración · enlazar evidencia |
| **GOV** | Gobernanza — "Consejo, compensación, litigios y señales ESG." | seguir litigios y gobernanza · resumir señales de consejo y compensación · marcar eventos regulatorios · citar fuentes primarias |

Al final: "Agregar un especialista — los especialistas personalizados están en el
roadmap… Plantillas próximamente."

### 3b. TEXTO EXACTO de cada agente (para programarlos sin la página)

Copia literal de lo que dice cada tarjeta. La descripción va en español y los
puntos del ROL PLANEADO están en inglés tal cual aparecen en la página. Cada
tarjeta muestra además el mismo trío de estados:
`MÓDULO: Beta · CONTROLES: Pronto · DATOS: Vista previa`, y dos botones muertos
("Configuración próximamente", "Ejecuciones próximamente") con la etiqueta
`roadmap`.

**FND · Fundamentales** — señal de adorno: Bullish
> "Lee reportes 10-K/Q y construye DCF y múltiplos comparables."
ROL PLANEADO:
- › connect filings and fundamentals
- › separate facts from assumptions
- › publish valuation notes
- › track source quality

**TCH · Técnicos** — Bullish
> "Patrones, régimen, volatilidad y momentum."
ROL PLANEADO:
- › wire price regime signals
- › normalize momentum inputs
- › add timeframe controls
- › explain invalidation levels

**SNT · Sentimiento** — Bullish
> "Noticias, transcripciones, redes y tono de analistas."
ROL PLANEADO:
- › add verified news lookup
- › summarize transcript tone
- › flag stale sources
- › score source reliability

**RSK · Riesgo** — Neutral
> "Superficie de volatilidad, riesgo de cola y exposición a factores."
ROL PLANEADO:
- › model factor exposures
- › add downside scenario checks
- › surface liquidity risks
- › explain confidence limits

**MAC · Macro** — Cautious
> "Tasas, divisas, materias primas y pronósticos de régimen."
ROL PLANEADO:
- › connect rates and FX context
- › map macro pressure to sectors
- › add regime notes
- › show date-stamped evidence

**SUP · Cadena de suministro** — Bullish
> "Salud de proveedores, geopolítica y logística."
ROL PLANEADO:
- › map suppliers and customers
- › watch logistics risk
- › flag concentration exposure
- › link source evidence

**GOV · Gobernanza** — Bullish
> "Consejo, compensación, litigios y señales ESG."
ROL PLANEADO:
- › track litigation and governance
- › summarize board and comp signals
- › flag regulatory events
- › cite primary sources

### 3c. Cómo va Nagimi contra esa lista (23-sep)

| Rol planeado de Aetheris | En Nagimi |
|---|---|
| TCH · señales de régimen, momentum, marcos, niveles de invalidación | ✅ **Hecho** — `lib/agenteTecnico.ts`: medias 20/50, RSI, ATR% y el precio donde la lectura se invalida (el muro contrario) |
| SNT · noticias verificadas, tono, marcar fuentes viejas | ✅ **Hecho** — `/api/agentes`: titulares del ticker, tono y aviso cuando la más reciente ya tiene días |
| MAC · tasas y divisas, presión macro, notas de régimen con fecha | ✅ **Hecho** — `lib/agenteMacro.ts`: SPY/TLT/UUP/GLD a 20 sesiones, con la fecha implícita de las sesiones |
| RSK · escenarios a la baja, riesgos de liquidez, límites de confianza | 🟡 **Parcial** — gamma skew (hacia dónde resbala) ✅; falta liquidez de la cadena y decir el límite de confianza |
| SNT · puntuar la fiabilidad de cada fuente | ⬜ Falta |
| TCH · control de marcos de tiempo dentro del agente | 🟡 El rango existe en la gráfica, no dentro del agente |
| FND · filings, DCF, múltiplos | ⬜ No aquí: ese motor es el proyecto de acciones |
| SUP · proveedores y logística | ⬜ Sin fuente de datos — no se finge |
| GOV · litigios, consejo, compensación | ⬜ Sin fuente de datos — lo más cercano es "Sigue a los Grandes" (13F) |

> **En Nagimi (22-sep):** `/agentes` ya tiene **11** agentes de verdad: los 6 que
> puntúan (AGR, CNV, INU, EST, IV, PRE) + RSK (gamma skew) + CAT (earnings) +
> **TCH** (medias 20/50, RSI, ATR y nivel de invalidación) + **SNT** (titulares,
> tono y aviso de noticia vieja) + **MAC** (SPY/TLT/UUP/GLD a 20 sesiones).
> FND, SUP y GOV se muestran con el motivo de por qué NO están, en vez de una
> tarjeta apagada.

---

## 4. Reportes (`/reports`)

- Etiqueta `REPORTES` + titular "Your research log".
- Filtros: `Todos · Acciones · Documento · Portafolio` y botón `+ New report`.
- Tabla: `TICKER · TÍTULO · CREADO · TIPO · ESTADO`.
- (El 22-sep la página se quedó colgando en "LOADING…" varias veces.)

> **En Nagimi:** copiado el 22-sep con filtros propios (Todos · Acertando ·
> A medias · Fallando · Sin medir), columna ESTADO con su porqué, y "+ Reporte
> nuevo". Lo que allá no hay: si la lectura **acertó** contra el precio real.

---

## 5. Portafolio (`/accounts`)

- Titular "Portafolio" + "Vincula tu cuenta de corretaje para análisis personalizado"
  + botón `+ Conectar Corretaje`.
- `BROKERS COMPATIBLES`: Robinhood · Charles Schwab · Fidelity · Interactive
  Brokers · E*TRADE · Webull · Vanguard · Ally Invest.
  Pie: "Powered by Plaid — 2,400+ financial institutions supported."
- `CUENTAS CONECTADAS`: **vacío** — "Aún no hay cuentas vinculadas."

> **En Nagimi:** `/portafolio` con las cuentas reales de Lorelay, el saldo de cada
> una y si se leyó en vivo por API o es una foto tomada a mano.

---

## 5b. Vista **Support / Resistance** del mapa (capturada el 23-sep)

El mapa tiene dos modos, con dos botones arriba a la derecha: `Projections`
(el de los conos, ya descrito) y `Support / Resistance`. El cono, el panel
derecho y la leyenda de abajo **no cambian**; lo que cambia es lo que se dibuja
sobre las velas.

En modo Support / Resistance aparecen **bandas horizontales gruesas**:
- **Resistencia** en morado (banda + línea punteada) con etiqueta pegada al eje:
  `Resistance 230` · `230.00`.
- **Soporte** en dorado con `Support 220` · `220.00`.
- El `Spot 224.79` sigue como línea fina punteada con su etiqueta azul.

**Lo que de verdad vale de este modo — los chips de abajo cambian y traen los
VENCIMIENTOS que confirman cada nivel:**

| Marco | Chips de la leyenda |
|---|---|
| 30D / 30M | `Spot 224.79` · `S 220 • 16d/23d/30d` · `R 230 • 16d/23d` · `R 235 • 30d` · `Max pain 200.00` · cono 1σ · cono 2σ |
| 5D / 5M | `Spot 224.78` · `S 220 • 2d` · `R 230 • 2d` · `S 223 • 5d` · `R 225 • 5d` · `Max pain 200.00` · cono 1σ · cono 2σ |

O sea: **un nivel no es un número suelto, es un número + en cuántos
vencimientos aparece**. `S 220 • 16d/23d/30d` significa que el soporte de 220
se repite en tres vencimientos seguidos — eso es lo que lo hace fuerte. Uno que
solo sale en un vencimiento (`R 235 • 30d`) es mucho más débil.

Al cambiar de marco cambian también los números del panel derecho, porque el
horizonte es otro: en 30D el cono va de 203 a 244 (2σ 183–265) y el bajista
apunta a $203; en 5D el cono es 212–231 (2σ 203–240) y el bajista a $212.

> **Para Nagimi:** los muros de gamma ya se calculan por vencimiento en la
> cadena, así que se puede poner exactamente esto: al lado de cada nivel, en
> qué vencimientos aparece. Un muro que se repite en 3 vencimientos aguanta
> más que uno de un solo vencimiento, y hoy Nagimi no distingue entre los dos.

---

## 6. Lo que queda por capturar

- **El detalle de un reporte** (al tocar una fila): ya está en
  `aetheris-referencia.md` con el reporte de NVDA del 10-sep, sección por sección
  (Veredicto, El Negocio, Valuación, vs Competidores, Qué puede salir mal/bien,
  La Puntuación, En Términos Simples, Niveles Clave, Datos Faltantes, Q&A).
- ~~La vista `Support / Resistance` del mapa de proyección~~ → capturada el
  23-sep, ver el punto 5b de arriba.
- ~~La pestaña `◬ Pendientes` de un reporte~~ → capturada, ver
  `aetheris-reporte-INTC-2026-09-22.md`.
- Ya no queda nada pendiente de Aetheris: **con estos dos archivos se puede
  seguir construyendo sin la página.**
