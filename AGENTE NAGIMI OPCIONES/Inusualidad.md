# Sub-Agente de Transacciones Inusuales

El propósito de este agente es identificar **transacciones inusuales** durante los últimos **30 días**.

> **¿Qué es una transacción inusual?** Son transacciones que ocurren con parámetros de "griegos" importantes, los cuales suelen ser utilizados por grandes instituciones.

---

## Tabla de Puntuación (Scoreboard)

### Tamaño de Órdenes

| Parámetro / Condición | Puntuación |
|---|---|
| $100k | 3 |
| $200k – $500k | 5 |
| $500k – $1M | 7 |
| $1M – $5M | 8 |
| Más de $5M | 10 |

### Delta

| Parámetro / Condición | Puntuación |
|---|---|
| 0.80 – 1.00 | 10 |
| 0.70 – 0.79 | 8 |
| 0.60 – 0.69 | 7 |
| 0.50 – 0.59 | 5 |
| Menos de 0.49 | 0 |

### Theta (porcentaje de decaimiento diario)

| Parámetro / Condición | Puntuación |
|---|---|
| Menor a 1% | 10 |
| 1% – 3% | 8 |
| 3% – 5% | 5 |
| Más de 5% | 0 |

### Gamma

| Parámetro / Condición | Puntuación |
|---|---|
| 0.03 – 0.08 | 10 |
| 0.08 – 0.15 | 8 |
| 0.01 – 0.03 | 10 |
| Mayor de 0.15 | 4 |
| Menor de 0.01 | 2 |

### Condición de Transacción

| Parámetro / Condición | Puntuación |
|---|---|
| Single leg | 10 |
| Multi leg | 5 |

### Vencimiento

| Parámetro / Condición | Puntuación |
|---|---|
| 320 días | 10 |
| 120 días | 10 |
| 90 días | 8 |
| 60 días | 7 |
| 30 días | 5 |
| Menor de 30 días | 2 |

---

> **Nota:** Comparar las transacciones que reportan los otros agentes para verificar la etiqueta (tag) de "inusual". Esta validación es un proceso aparte y **no forma parte del scoreboard**.
