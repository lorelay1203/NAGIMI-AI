# Aetheris / FinAnalista — anatomía de un reporte (referencia para Nagimi)

Capturado el 2026-09-10 explorando `aetheris.up.railway.app` con la cuenta de
Lorelay (INFUSION · PRO). Aetheris es de Víctor González (CEO de MarketSnack e
Infusion Investment). El acceso de Lorelay vence ~fin de septiembre 2026, así
que esto queda como espec de construcción: **el lenguaje claro que le gusta y
la estructura, para portarlo a Nagimi sin depender de seguir viendo la página.**

Aetheris analiza **ACCIONES a largo plazo** (fundamentales, DCF). Nagimi es de
**FLUJO DE OPCIONES**. Por eso no todo aplica: abajo cada sección marca si va a
Nagimi-opciones **ahora**, si es para la **expansión a acciones** (futura), o si
Nagimi **ya lo tiene**.

---

## El PATRÓN que se repite en cada sección (esto es lo más copiable)

Toda sección de un reporte Aetheris tiene la misma forma, y por eso se ve
ordenada y se entiende:

1. **Fila de "chips" de métricas** — 3 a 6 números grandes con su etiqueta
   corta arriba (ej. `MARGEN BRUTO 71.1%`, `FCF FY2026 $96.7B`).
2. **Un visual** cuando hay datos — una barra, una tabla, o niveles con % y
   probabilidad.
3. **Un párrafo en lenguaje llano** que explica qué significa, sin tecnicismos.
4. **"¿Te resultó útil?"** — botón de feedback al final de cada sección.

> **Para Nagimi:** adoptar este molde `chips → visual → párrafo llano` en cada
> tarjeta. Es barato y hace que todo se lea igual de claro.

---

## Las 3 pestañas de profundidad (divulgación progresiva)

Un mismo reporte se lee a tres niveles — el usuario elige cuánto detalle:

- **⚡ Resumen rápido** — 3 cajas (ventaja/riesgo/vigila) + analogía + "¿deberías
  comprar a $X?" + conclusión + evolución de la tesis.
- **⌬ Análisis profundo** — todo lo anterior + secciones colapsables.
- **⁂ Investigación completa** — todas las secciones expandidas, con chips y
  tablas. La vista más rica.
- **◬ Pendientes (6)** — checklist de acciones.

> **Nagimi ya tiene** un toggle Estudiante/Pro parecido en algunas páginas.
> Vale unificarlo: un solo control de "cuánto detalle" en el análisis.

---

## Sección por sección (contenido real del reporte NVDA del 10-sep)

### 1. Veredicto  → Nagimi YA lo tiene (rediseñado hoy con 3 cajas)
Chips: `VALOR JUSTO $233.76 · POTENCIAL ALZA 7.1% · PRECIO ACTUAL $218.36 ·
RECOMENDACIÓN Mantener/Acumular · PUNTAJE 68`.
Frase clave del estilo — **"Actualización de postura previa"**:
> "En mi análisis del 8 de septiembre a $228.62 califiqué NVDA como precio justo.
> El precio ha caído −4.5% exactamente hacia la zona que anticipé. La tesis se
> mantiene válida — de hecho mejora el punto de entrada."
Es el agente revisándose a sí mismo. **Nagimi puede hacerlo mejor**: ya guarda
las fotos (evolución de tesis, hecho hoy) Y calcula el % de acierto real
(Reportes). Falta cruzar: "mi lectura anterior, ¿se cumplió?".

### 2. El Negocio  → EXPANSIÓN A ACCIONES (no opciones)
Chips: `FCF $96.7B · MOAT 5/5 · MARGEN BRUTO 71.1% · MARGEN OPERATIVO 60.4% ·
REVENUE GROWTH +65.5% YoY`. Barra de ingresos FY2023→FY2027E. Párrafo del negocio.
Es fundamentales puros. Para cuando Nagimi tenga módulo de acciones (ya existe
el motor "Warren Buffett Jr" en Python que produce justo esto).

### 3. Valuación y Objetivos  → MIXTO
Chips: `P/S 21x · BASE $240 · BAJISTA $185 · ALCISTA $275 · DCF $233.76`.
**Escenarios con probabilidad**: Alcista $275 (+26%, 30%) / Base $240 (+10%,
50%) / Bajista $185 (−15%, 20%).
> **Nagimi YA tiene** escenarios bear/base/bull con probabilidad (PredictionCard).
> El DCF/valor-justo es de acciones (expansión).

### 4. vs Competidores  → EXPANSIÓN A ACCIONES
Tabla NVDA vs AVGO/ADI/AAPL (P/S, márgenes, cap. mercado). Fundamentales.

### 5. Qué Puede Salir Mal  → parcialmente útil (patrón de riesgos)
Chips: `RISK LEVEL Alto · EXPORT RISK Moderado-Alto · INSIDER SELLING Crítico`.
Riesgos con semáforo: 🔴 crítico, 🟡 medio. Ej: "🔴 Un director vendió $400M+ en
5 días — señal de cautela." **Patrón copiable**: lista de riesgos con semáforo
🔴🟡. Nagimi ya tiene "En contra" en el veredicto; podría listar riesgos así.

### 6. Qué Puede Salir Bien  → parcialmente útil (mismo patrón, verde)
Chips: `BLACKWELL BACKLOG 12+ meses · BEATS 8 trimestres`. Catalizadores 🟢 +
gráfico de EPS real vs estimado por trimestre. El **historial de sorpresas de
earnings** (8 beats seguidos) es un patrón lindo, pero es de acciones.

### 7. La Puntuación  → Nagimi YA tiene los datos, falta presentarlo así ⭐
**Desglose ponderado de por qué el puntaje es 68:**
| Factor | Peso | Puntaje |
|---|---|---|
| Calidad del Negocio y Moat | 15% | 95 |
| Salud Financiera | 15% | 90 |
| Calidad del Management | 10% | 72 |
| **Flujo de Opciones (Alineación)** | 20% | 45 |
| Atractivo de Valuación | 20% | 52 |
| Catalizadores y Timing | 10% | 78 |
| Ratio Riesgo-Retorno | 10% | 65 |
| **Compuesto** | | **69** |
> Nagimi tiene su propio "AI Sentiment Score" con sub-agentes ponderados
> (Agresividad, Convicción, Inusualidad…). Presentarlo como esta tabla — "por
> esto el puntaje es X" — es un win claro y options-native.

### 8. En Términos Simples  → Nagimi YA lo tiene (copiado hoy) + falta la analogía
Chips: `WATCH FOR · BASE · BAJISTA · ALCISTA · BIGGEST PRO · BIGGEST RISK ·
SIMPLE VERDICT`. Estructura:
- **Analogía**: "NVIDIA es como el que vende las palas en la fiebre del oro."
- **"¿Deberías comprar a $218?"** respondida con precio y tamaño ("empieza con
  2-3% máximo, espera confirmación en earnings").
- **"La conclusión:"** una línea.
> Nagimi ya copió la pregunta "¿Entro ahora a $X?" y la conclusión. **Falta la
> ANALOGÍA** — una línea "esto es como…". Pequeño, solo texto.

### 9. Niveles Clave  → LA JOYA para Nagimi-opciones ⭐⭐
Chips: `PIVOT $218.85 · PRECIO $218.36 · SUGGESTED STOP $207.25 (~5.1%) ·
NEAREST SUPPORT $216.20 · SUGGESTED ENTRY $215–$218 · NEAREST RESISTANCE $227.92`.
Niveles con probabilidad: Resistencia $227.92 (+4%, 65%) / Pivot (50%) /
Soporte $216.20 (−1%, 70%).
> **El plan de operación en llano** — esto es lo que más vale:
> "Zona de entrada para perfil Moderado: $215-218. Stop-loss en $207.25 (~5.1%,
> dentro del rango de tu perfil). Ratio riesgo-retorno hacia $240 ≈ 1:2."
> **Nagimi tiene todos los datos** (muros GEX = soporte/resistencia, spot,
> escenarios, el perfil de riesgo de Lorelay). Falta juntarlo así de masticado:
> *entra aquí · sal aquí si va mal · ganas 2 por cada 1 que arriesgas · cabe en
> tu perfil.*

### 10. Datos Faltantes  → Nagimi YA tiene esta filosofía
"No se pudieron obtener estos datos, así que el análisis no los incluye:
Calificación compuesta, Sentimiento del mercado." Honesto en vez de fingir.
Nagimi ya reporta lo que falta en vez de mostrar $0.

### 11. Pregunta sobre este reporte  → Nagimi YA tiene chat, falta scoping
Q&A acotado al reporte (0/10 preguntas), con sugeridas: "¿Cuáles son las mayores
red flags?", "Explica la actividad de opciones", "¿Está sobrevalorada?", "¿Caso
alcista vs bajista?". **Nagimi tiene ChatBox**; falta acotarlo al ticker y dar
preguntas sugeridas de un clic.

---

## Lista de construcción priorizada (para las próximas 2 semanas)

**Options-native, con datos que Nagimi YA tiene — hacer primero:**
1. ⭐⭐ **Plan de operación** (Niveles Clave): zona de entrada + stop-loss + ratio
   riesgo/retorno + "cabe en tu perfil". Sección #9.
2. ⭐ **"Por qué este puntaje"** (La Puntuación): desglose ponderado de los
   sub-agentes. Sección #7.
3. **Analogía simple** en el veredicto ("esto es como…"). Sección #8.
4. **Riesgos con semáforo** 🔴🟡 en el veredicto. Sección #5.
5. **Chat acotado al ticker** con preguntas sugeridas. Sección #11.
6. Cruzar **evolución de tesis + acierto real** ("mi lectura anterior ¿se
   cumplió?"). Sección #1.

**Patrón transversal:** aplicar `chips → visual → párrafo llano → ¿útil?` a
todas las tarjetas de Nagimi.

**Para la expansión a ACCIONES (futura, el motor Python ya existe):**
El Negocio (#2), Valuación DCF (#3), vs Competidores (#4), historial de earnings
(#6). No inventarlos en la app de opciones — vendrían del motor de acciones.

---

## Proyecciones (el "Agente de Opciones IA") — ⭐⭐⭐ lo más Nagimi de todo

Capturado ejecutando una proyección real de NVDA. **Esto NO es de acciones —
es puro GEX/opciones, exactamente lo que Nagimi hace.** Nagimi ya calcula casi
todos estos datos; lo que falta es PRESENTARLOS así.

**Cómo funciona:** buscas el ticker, eliges horizonte (5D táctico / 30D swing /
90D posición → cada uno es una ventana de DTE distinta) y ejecuta.

**Qué muestra:**

- **Mapa de proyección** estilo TradingView (velas) con:
  - Líneas de **soporte/resistencia** anotadas con los días que importan:
    `S 215 • 1d/4d`, `R 220 • 1d`, `R 230 • 4d`.
  - **Spot** marcado, **Max pain** marcado (195.00).
  - **Cono de movimiento esperado hacia adelante**: dorado = 1σ, azul = 2σ
    (rango de estrés). El cono se dibuja proyectado a la derecha del precio.
  - Toggle de marco temporal: 5D/5M · 30D/30M · 3M/1D.
  - Toggle de vista: "Projections" vs "Support / Resistance".

- **Lectura de proyección**: un número base ("218 — 6mo base path from options
  pressure").

- **Probabilidades por escenario** con **razón en llano atada al GEX** (y el
  texto CAMBIA con el régimen):
  - Bullish 25% · target $229 · "Upside is the lower-probability case because
    negative GEX and the base path lean against a breakout."
  - Neutral 42% · target $218 · "GEX is balanced, so the cleanest read is mean
    reversion inside the one-standard-deviation cone."
  - Bearish 33% · target $206 · "Downside remains plausible, but GEX is not
    dominant enough to make it the primary case."

- **Cono de movimiento esperado** (números): 1σ low 196 · Base 218 · 1σ high
  240 · 2σ stress range 175–261.

**Qué copiar a Nagimi (ya tiene los datos: GEX, muros, max pain, expectedMove
1σ/2σ, escenarios, régimen):**
1. ⭐ **Dibujar el cono 1σ/2σ hacia adelante** sobre el gráfico (Nagimi tiene la
   mate en `expectedMove.ts`, falta el visual del cono).
2. ⭐ **Razón en llano por escenario, atada al régimen GEX** — que el texto
   cambie: gamma positiva → "tiende a volver al imán / mean reversion"; gamma
   negativa → "puede acelerar, no lo trates como ruptura segura".
3. **S/R anotados con el/los días (expiries) en que pesan.**
4. **Max pain en el gráfico.**
5. **Los 3 horizontes** (5D/30D/90D) mapeados a ventanas de DTE.

> Nota: Nagimi ya muestra GEX, muros, escenarios y expected move en su análisis
> — esta pestaña es sobre todo un tema de PRESENTACIÓN (el cono forward + las
> razones en llano). Es de las cosas más rápidas de mejorar con alto impacto.

---

## Pendientes de explorar (si queda tiempo de acceso)
- "Pregunta sobre este reporte" — Q&A acotado con preguntas sugeridas de 1 clic
  (vi las sugeridas, no ejecuté una).
- Reporte de una CRIPTO (BTC) — puede tener secciones distintas.
- ⌘K (paleta de comandos global "ve a un ticker/agente/reporte").
- Documentos (Pronto), Comentarios, Chat (Pronto), Portafolio (404) — vacíos.
