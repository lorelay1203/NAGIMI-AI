# Sub-Agente de Convicción (Time & Sales)

Este agente estará encargado de leer el **Time and Sales** de convicción de la empresa para buscar diversos datos:

---

## 1. Spread

Queremos calcular el spread en varias opciones para detectar dónde se mueve el *Smart Money*.

- **Definición:** Es la diferencia entre el **Bid** y el **Ask**, expresada en porcentaje para elaborar la tabla de clasificación.
- **Clasificación del Spread:**

| Spread | Puntos |
|---|---|
| Menor de 2% | 10 |
| 2% a 5% | 7 |
| 5% a 10% | 4 |
| Más de 10% | Separar aparte |

> Si la transacción excede el **millón de dólares**, se debe crear una alerta en la interfaz para analizar estas operaciones con mayor profundidad.

---

## 2. Dominancia ASK vs BID

Mide hacia qué lado se ejecuta la mayoría de transacciones.

> **Ejemplo:** Si el 80% del volumen se ejecuta en el Ask y el 20% en el Bid, hay una clara dominancia hacia el lado comprador.

| Dominancia en un solo lado | Puntos |
|---|---|
| 80%+ | 10 |
| 70–79% | 8 |
| 60–69% | 6 |
| 55–59% | 4 |
| 50–54% | 2 |
| Menos de eso | 0 |

**Interpretación direccional:**
- ↑ 80% en Ask = presión compradora
- ↓ 80% en Bid = presión vendedora

---

## 3. Fuerza de ejecución

Mide qué tan agresiva fue la orden, según dónde se ejecutó respecto al spread Ask/Bid. Niveles de ejecución (de más a menos agresivo):

| Nivel de ejecución | Puntos |
|---|---|
| Above Ask / Below Bid | 10 |
| At Ask / At Bid | 8 |
| Cerca del Ask o del Bid | 6 |
| Mid | 3 |
| Sin claridad | 0 |

> **Nota importante:** Aquí el score mide la **fuerza** de la ejecución; la **dirección** se etiqueta por separado: Ask = bullish / Bid = bearish.
