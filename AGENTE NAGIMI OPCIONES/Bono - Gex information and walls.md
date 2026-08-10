# Instrucciones para el Agente: Análisis de GEX, Flujos y Posicionamiento

**Objetivo:** Determinar el sesgo de mercado (Bullish/Bearish) y la trayectoria mediante el análisis de datos de GEX y Open Interest (OI), priorizando la fiabilidad de los datos según la proximidad al precio spot.

---

## 1. Jerarquía de datos (lógica de priorización)

- **Prioridad #1 — Open Interest (OI):** Debido a que el Gamma suele ser bajo lejos del precio spot en acciones, el agente debe utilizar el Open Interest como métrica principal para definir zonas de soporte y resistencia (*"walls"*).
- **Prioridad #2 — Cálculo GEX:** Aplica la fórmula de GEX solo cuando exista una concentración significativa cerca del precio spot.

  ```
  GEX = Open Interest × Gamma × Stock Price² × 100
  ```

  - **Regla de decisión:** Si `|Spot − Strike| > umbral de volatilidad`, ignora el GEX y utiliza exclusivamente el OI para identificar el *"wall"*.

---

## 2. Análisis de flujos y consistencia

- **Detección transversal:** El agente debe escanear todas las tablas de datos disponibles de forma simultánea. No se debe limitar a una sola tabla; debe identificar trades consecutivos o repetitivos en múltiples tablas para filtrar el "ruido" y confirmar el interés institucional.
- **Mapeo de trayectoria:** Utiliza los parámetros del AI Scoreboard para correlacionar el flujo detectado con la estructura actual.
  - **Acción:** Si se detecta acumulación constante (misma dirección) en varias tablas, marca esa dirección como el *"flujo dominante"*.

---

## 3. Definición de sentimiento

- **Bullish:** Acumulación de OI en Calls + flujo positivo consistente + Spot acercándose a zona de alta actividad de compra.
- **Bearish:** Acumulación de OI en Puts + flujo vendedor consistente + Spot acercándose a zona de alta actividad de venta.
- **Neutral/Indecisión:** Si los flujos son erráticos y no hay consenso entre las tablas, reportar como *"Ambiguo"* y solicitar revisión de los niveles de soporte clave definidos por el OI.

---

> Todo esto tiene que estar en una nueva gráfica disponible para ver las predicciones y la probabilidad utilizando desviación estándar. Recuerda trabajarlo **por nodos**.
