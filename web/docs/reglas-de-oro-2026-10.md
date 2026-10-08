# Reglas de oro — cómo armar un trade en Nagimi

Temas: Theta, Delta, IV Crush, lectura de flujo y GEX.
En código: `lib/reglasOro.ts` (chequeo que sale en el Ticket del día).

## 1. Elegir el contrato
| Regla | Qué dice |
|---|---|
| Delta | < 0.25 descartar · 0.30–0.40 promedio solo si vence en +90 días · 0.50–0.60 bueno · 0.70–1.0 excelente. Excepción: 0DTE un poco fuera del dinero para agarrar la gamma cuando cruza el strike. |
| Theta | theta ÷ precio del contrato: > 5% al día no entres · ≤ 2% bien · 1% excelente. "El tiempo no puede ir más rápido que el dinero." |
| IV | 24–48% sano · 70–80% cuidado · 90%+ catastrófico. Antes de earnings: no comprar; mejor vender prima o vertical spread. |
| Barato ≠ bueno | El contrato más barato casi siempre es el que más pierde. |

## 2. Operar con el GEX (SPX)
- Funciona mejor en SPX (se liquida en efectivo). Para /ES o /MES: marcar niveles en SPX y convertirlos.
- GEX total cerca de cero (±2B) → no operar. Mejor 3–4B o más; 20B "hermoso".
- No operar el zigzag (+ − + − por strike).
- No operar la primera hora (9:30–10:30 AM NY).
- Gamma positiva: tranquilo, los retrocesos se compran hacia el imán. Gamma negativa: más volátil, rupturas y rebotes fuertes.
- Strike: 10–30 puntos ANTES de la meta (delta 30–60) para que entre en el dinero y acelere. Nunca el strike en la meta.
- Salida: unos puntos antes de la meta (meta 7,000 → 6,996 ya cuenta).
- Si rompe el imán → va al muro y puede regresar al imán. Si el imán = muro → salir ahí.
- Nivel extremo: el precio pasó el muro y el muro NO se reubica → entra en contra hasta el muro.
- Si el muro se mueve (se "relocaliza") a favor, el movimiento sigue.
- Confirmar con el institutional flow tape. Datos en tiempo real; con retraso, menos confiable.
- Día raro que no conoces → no operes, anótalo.

## 3. Leer el flujo (MarketSnack)
- Filtrar > $100K, solo bid/ask (no mid), single leg, mirar ~1 mes.
- Ask = comprando con agresividad; bid = vendiendo.
- Mirar open interest (¿se está quedando el dinero?), net premium (positivo = a favor del contrato) y premium drift.
- Embudo: transacciones > $1M en deltas buenas → single vs multileg → etc.
- Si venden muchos calls de un strike a una fecha → probablemente no pasa de ahí para esa fecha.
- Trade en la acción con el flujo: meta donde va el dinero grande, stop que dé 2:1 o mejor (1:1 no vale la pena).
