# Sub-Agente de Contexto (Volatilidad)

Este agente debe verificar el **contexto de movimiento** que pudiese tener la acción. Tienes que recopilar cuál es el promedio de la volatilidad implícita (IV) para las diferentes fechas de expiración y cuáles son los contratos que mayor IV tienen. Esto nos ayuda a identificar que un movimiento posible está a punto de pasar o que la acción tiene rangos altos de movimiento.

---

## Implied Volatility (IV)

| IV | Puntos |
|---|---|
| +100% | 6 *(quizás una categoría especial, por encima del objetivo)* |
| 90% – 99% | 5 |
| 61% – 89% | 8 |
| 40% – 60% | 10 |
| 30% – 39% | 5 |
| Menos de 30% | 2 |

---

## IV Rank

Necesitamos entender la procedencia de la acción, si el movimiento se está comprimiendo o aumentando. Además, el IV Rank nos ayuda a visualizar el IV histórico para determinar si existe movimiento.

> **IV Rank:** esto es en comparación al *Current IV*.

| IV Rank | Puntos |
|---|---|
| 0% – 15% | 2 |
| 16% – 30% | 10 |
| 31% – 50% | 8 |
| 51% – 70% | 5 |
| 71% – 99% | 1 |
| 100% | 0 |
