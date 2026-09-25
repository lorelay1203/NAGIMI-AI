# Agentes por armar — investigación del 25-sep-2026

Qué hace falta para completar los agentes que Aetheris lista en "ROL PLANEADO"
(ver `aetheris-capturas-2026-09-22.md`, sección 3b) y los huecos que quedaron
en Nagimi (sección 3c). Cada fuente se probó en vivo con NVDA y las claves de
Lorelay el 25-sep: **200 = funciona con su plan, 403 = bloqueado por el plan**.

## Fuentes probadas

| Fuente | Qué da | Estado |
|---|---|---|
| SEC `data.sec.gov/submissions` | Lista de filings: 8-K (con sus "items"), Form 4, 10-K/10-Q, DEF 14A, 13F | ✅ 200, gratis |
| SEC `api/xbrl/companyfacts` | 627 conceptos contables (ventas, inventario, demandas pagadas, provisión por litigios, compensación en acciones) | ✅ 200, gratis |
| SEC búsqueda de texto completo (`efts.sec.gov`) | Buscar palabras en todos los filings ("subpoena", "class action", "export controls") | ✅ 200, gratis |
| SEC archivos (`/Archives/edgar/data`) | El texto del 10-K/DEF 14A (p. ej. "Customer A accounted for 12% of revenue") | ✅ ya se usa en `bigMoney.ts` |
| Finnhub `stock/metric` | Múltiplos, márgenes, crecimiento, beta, 52 semanas | ✅ 200 |
| Finnhub `insider-transactions` | Cada compra/venta de directivos (Form 4) | ✅ 200 |
| Finnhub `insider-sentiment` | Balance mensual de compras vs ventas de insiders (MSPR) | ✅ 200 |
| Finnhub `stock/peers` | Competidores (NVDA → AVGO, MU, AMD, INTC…) | ✅ 200 |
| Finnhub `stock/recommendation` | Tono de analistas por mes (compra fuerte / compra / mantener / venta) | ✅ 200 |
| Finnhub `financials-reported`, `stock/filings` | Estados tal como se reportaron, lista de filings | ✅ 200 |
| Finnhub `stock/lobbying`, `usa-spending` | Cabildeo y contratos con el gobierno | ✅ 200 |
| Massive `vX/reference/financials` | Estados financieros (últimos 12 meses y por trimestre) | ✅ 200 |
| Massive `v1/related-companies` | Empresas relacionadas | ✅ 200 |
| Finnhub `supply-chain`, `revenue-breakdown` | Proveedores/clientes reales, ventas por cliente | ⛔ 403 |
| Finnhub `price-target`, `upgrade-downgrade` | Precio objetivo y cambios de analistas | ⛔ 403 |
| Finnhub `social-sentiment`, `transcripts` | Redes sociales, transcripciones de llamadas | ⛔ 403 |
| Finnhub `executive`, `esg` | Sueldos de ejecutivos, puntaje ESG | ⛔ 403 |
| Finnhub `calendar/economic` | Calendario económico (CPI, Fed…) | ⛔ 403 |

## Agente por agente

### RSK · Riesgo — completar (no necesita datos nuevos)
- **Liquidez de la cadena:** diferencia compra/venta, contratos abiertos y
  volumen de los contratos cerca del precio — ya vienen en la cadena del ticket.
- **Límite de confianza:** cuántos agentes tuvieron datos, qué tan atrasados
  vienen (MarketSnack 5 min, Schwab SPX atrasado), y decirlo en una línea.
- **Exposición a factores:** beta contra SPY y QQQ con las velas diarias que ya
  se guardan (`barsStore`).
- **Escenarios a la baja:** ya existe el cono de movimiento esperado; sumarle
  "si pierde el suelo, hasta dónde".

### GOV · Gobernanza — se puede armar YA, todo gratis
- **Insiders:** compras y ventas de directivos (Finnhub Form 4 + MSPR). Una
  compra de un directivo con su dinero pesa mucho más que una venta (las ventas
  suelen ser planes automáticos: código de transacción "S" con plan 10b5-1).
- **Eventos del 8-K:** el "item" dice qué pasó — 5.02 cambio de directivos o
  consejo, 1.01 acuerdo importante, 2.02 resultados, 5.07 votación de
  accionistas, 4.02 estados financieros que ya no valen (alerta roja).
- **Demandas:** XBRL `LossContingencyAccrualAtCarryingValue` y
  `LitigationSettlementExpense`, más búsqueda de texto ("class action",
  "subpoena", "Department of Justice") en filings recientes.
- **Cabildeo y contratos del gobierno** (Finnhub, 200).
- **Falta:** sueldos de ejecutivos (Finnhub 403) → sacarlos del DEF 14A de la
  SEC es posible pero más trabajo; ESG no disponible.
- **Cita siempre la fuente primaria** (link al filing en sec.gov).

### SNT · Sentimiento — completar
- **Fiabilidad de cada fuente:** tabla propia (SEC/Reuters/Bloomberg/AP alta,
  medios financieros media, blogs y agregadores baja) — no necesita datos.
- **Tono de analistas:** Finnhub `recommendation` (200) — cómo cambió de un mes
  a otro.
- **Falta:** redes sociales y transcripciones de llamadas (403).

### FND · Fundamentales — versión para opciones
- Antes se dijo "vive en el proyecto de acciones". Para opciones basta una
  versión ligera: crecimiento de ventas, márgenes, deuda, y **múltiplos contra
  sus competidores** (Finnhub `metric` de cada uno de `peers`).
- Fuentes: Massive financials, Finnhub metric/financials-reported, SEC XBRL —
  todas 200.
- Separar **hechos** (lo reportado) de **supuestos** (cualquier proyección), y
  decir de qué fecha es cada dato.
- Un DCF completo no hace falta para decidir un contrato de días o semanas.

### MAC · Macro — completar
- **Presión por sectores:** ETFs de sector (XLK, XLF, XLE, XLV, SMH…) con las
  velas que ya se bajan; decir si el sector del ticker va con o contra el viento.
- **Evidencia con fecha:** poner la fecha de cada serie.
- **Falta:** calendario económico (403). Alternativa gratis: FRED (necesita una
  clave gratuita) o una lista fija de fechas de la Fed/CPI por año.

### TCH · Técnicos — completar
- **Marcos de tiempo:** leer la misma tendencia en diario, semanal y 1 hora
  (las velas ya existen) y decir si coinciden.

### SUP · Cadena de suministro — solo parcial, y se dice
- **No hay** fuente de proveedores/clientes reales en su plan (Finnhub 403).
- Lo que SÍ se puede:
  - **Concentración de clientes** leyendo el 10-K ("Customer A accounted for
    X% of revenue").
  - **Inventario vs ventas** (XBRL): inventario creciendo más rápido que las
    ventas = posible atasco.
  - **Competidores y relacionadas** (Finnhub peers + Massive related): si todo
    el grupo cae, es riesgo del sector, no de la empresa.
  - **Menciones de riesgo** en filings recientes ("export controls",
    "tariff", "supply constraint") por búsqueda de texto.
- La tarjeta tiene que decir claramente que el mapa de proveedores no está.

## Orden recomendado

1. **RSK** — protege el dinero y no necesita nada nuevo.
2. **GOV** — todo gratis y ya probado; los insiders son una señal fuerte.
3. **SNT** — fiabilidad de fuentes + tono de analistas.
4. **FND ligero** — múltiplos contra competidores.
5. **MAC por sectores**.
6. **TCH marcos de tiempo**.
7. **SUP parcial**.

Regla para todos: cada lectura dice su fuente y su fecha; lo que no se pudo
medir se dice, nunca se inventa.
