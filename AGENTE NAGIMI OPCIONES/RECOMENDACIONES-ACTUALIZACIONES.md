# Nagimi AI Options — Recomendaciones de actualizaciones

_Documento de trabajo. Generado 2026-07-27. Material educativo, no es consejo financiero._

## Estado actual (verificado)

| Componente | Estado |
|-----------|--------|
| Massive API key (opciones, velas, contratos, referencia) | ✅ Válida |
| Massive · stock snapshot (precio en vivo) | ⚠️ 403 — el plan no lo incluye; el sistema cae al último cierre de velas |
| MarketSnack cookie (Time & Sales) | ❌ Caduca periódicamente — renovar cuando dé 401 |
| Fix de rate-limit (429 retry/backoff) | ✅ Aplicado en `web/lib/massive.ts` |
| Tema oscuro/negro | ✅ Aplicado |
| Gráfica Top-5 por Notional en vista Pro | ✅ Con etiquetas contrato/exp/OP/notional |

## Prioridad ALTA

1. **Vista de "Muros de Strikes" (Strike Walls) propia.** Agregar una tabla/panel que agrupe la cadena por strike y muestre: Notional total, Call-notional vs Put-notional, OI, y distancia al spot. Marcar automáticamente los mayores muros CALL (resistencias potenciales) arriba del spot y PUT (soportes potenciales) abajo. Es justo lo que hoy se calcula a mano.

2. **Detección y aviso de cookie de MarketSnack vencida.** Cuando `/api/flow` devuelva 401, mostrar un banner claro ("Renueva tu cookie de MarketSnack") con los pasos, en vez de un error genérico. Opcional: un chequeo al arrancar.

3. **Etiquetar los datos como DELAYED.** Como el stock snapshot en vivo da 403 y el precio sale de velas (status DELAYED en Massive), mostrar una etiqueta "datos diferidos" para no confundir con tiempo real.

## Prioridad MEDIA

4. **Auto-refresco / watchlist.** Lista de tickers (TSLA, NVDA, SPY, AAPL + los que agregue) que se reanalicen en intervalo y guarden el último resultado. Base para las alertas.

5. **Sistema de alertas (alertas + confirmar a mano).** Cuando un ticker de la watchlist cruce un umbral (score alto, flujo inusual, muro de strike relevante), enviar aviso (Telegram/email/on-screen). La usuaria revisa y decide la orden manualmente. NO ejecución automática.

6. **Ratio Put/Call y sesgo de notional** como indicador rápido en el header del ticker (hoy 1.68 en SPY = más peso en puts).

## Prioridad BAJA / futuro

7. **Exportar reporte** del análisis (a esta carpeta) en Markdown/PDF por ticker y fecha, para llevar histórico.
8. **Snapshot histórico de muros** para ver cómo se mueven los strikes de mayor OI día a día.
9. **Integración con broker sólo-lectura** (Charles Schwab Trader API) para ver posiciones junto al análisis. Sin órdenes automáticas.

## Notas de riesgo

- Automatizar ≠ ganar. Cualquier ejecución debe empezar en **paper trading** y codificar límites de riesgo estrictos (perfil conservador: máx 1% por operación).
- OI y notional altos marcan **dónde se concentra el interés**, no la dirección garantizada del precio.
- Nada aquí es recomendación de compra/venta.
