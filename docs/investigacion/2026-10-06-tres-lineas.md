# Tres líneas nuevas: posicionamiento saturado, cortos a listados nuevos y carry de funding

**Fecha:** 2026-10-06 · **Estado:** pre-registradas; backtest sin correr.

## Por qué estas tres

Las 55 variantes probadas hasta ahora (4h/1d el 05/10, 1h el 06/10) comparten un supuesto: **predecir el precio con velas que ve todo el mundo, pagando taker en cada entrada y salida**. Ninguna tuvo ventaja después de costos.

Las tres líneas nuevas buscan ventaja en otro lado:

| Línea | De dónde vendría la ventaja | Pista propia |
|---|---|---|
| **POS** · posicionamiento saturado | Datos que las estrategias de velas no usan: open interest y ratio long/short de cuentas. Cuando el mercado está cargado de un lado, tiende a barrer a ese lado. | En el diagnóstico de 1h (§7.3), el filtro de **funding**, que mide la saturación, fue el que más aportó. |
| **LIST** · cortos a listados nuevos | Estructura de la oferta. Los tokens nuevos llegan con poca oferta circulante, mucho por desbloquear y airdrops que se venden. | En la tanda del 05/10 los cortos fueron lo más estable in-sample (§10, Hallazgo 4), aunque no pasaron fuera de muestra. |
| **CARRY** · carry de funding | Que te paguen: los largos apalancados pagan funding a quien está corto. No predice el precio. | Investigación del 05/10 (`2026-10-05-como-se-gana-en-trading.md` §3). |

Las tres las eligió el usuario el 2026-10-06.

## Reglas comunes

- **Cuenta:** 300 USDT, margen fijo de 6 USDT, x1–x10 con la Regla 1, máximo 5 posiciones. Para CARRY ver su sección.
- **Costos:**
  - Taker de 0,05 % por lado en perpetuos y de 0,10 % en spot.
  - Slippage por liquidez.
  - Funding real.
  - Liquidación en aislado.
- **Datos y validación:**
  - Universo point-in-time, sin look-ahead.
  - Walk-forward de 24 meses in-sample y 6 out-of-sample, re-seleccionando dentro de cada línea.
- **Holdout:** 2025-10 → 2026-09, intacto. Se usa una sola vez y solo para una línea que haya pasado.
- **Criterios de aceptación:** los mismos de siempre, sin relajarlos, sobre la curva OOS concatenada de cada línea.
  1. Sharpe ≥ 1,0, y positivo con costos ×2.
  2. Deflated Sharpe ≥ 0,95.
  3. MDD en el p95 de Monte Carlo ≤ 25 %.
  4. PnL positivo sin las 3 mejores monedas.
  5. Mayoría de semestres positivos.

  **CARRY suma un criterio:** rendimiento anual neto > 4,1 % (T-bill a 3 meses), porque si no, no vale el riesgo de exchange.
- **Presupuesto:** 4 variantes por línea, **12 en total**. N acumulado para el Deflated Sharpe: 55 + 12 = **67**.

---

## POS · Posicionamiento saturado (contrarian)

**Tesis.** Cuando las cuentas minoristas están muy cargadas de un lado y el funding lo confirma, el movimiento siguiente tiende a ir en contra de ese lado (barrido de liquidez y cierre forzado de apalancados).

**Datos.** `metrics` diarios de data.binance.vision, en filas de 5m:
- `count_long_short_ratio` (cuentas long/short);
- `sum_open_interest`;
- más el funding.

Las altcoins tienen métricas desde **2021-12**.

**Reglas** (TF de señal 4h, universo top 30 point-in-time):
- **Muestreo:** por cada vela de 4h se toma la última fila de métricas anterior a su cierre.
- **Indicadores**, cada uno con z-score sobre las últimas 180 velas de 4h (30 días):
  - `zLS`: ratio long/short de cuentas.
  - `zF`: promedio de los últimos 3 eventos de funding.
  - `zOI`: cambio logarítmico del open interest en 3 días (18 velas).
- **Saturación:**
  - Variante `ls`: C = zLS, con umbral 2,0.
  - Variante `combo`: C = (zLS + zF) / 2 y además zOI > 0, es decir, el apalancamiento está creciendo. Umbral 1,5.
- **Entrada:** C > umbral → **corto**; C < −umbral → **largo**. Se ejecuta al open de la vela siguiente.
- **Salida:** por tiempo, a las H velas de 4h. Stop duro de 2,5 ATR(14) de 4h. Sin TP.

**Variantes:** {ls, combo} × H ∈ {6 velas (24 h), 18 velas (72 h)}.

**Período in-sample:** 2022-02 → 2025-09. El primer mes se usa para calentar los z-scores. El walk-forward da ~4 tramos OOS, desde 2024-02.

## LIST · Cortos a listados nuevos

**Tesis.** Los perpetuos recién listados caen en las semanas siguientes al listado, por la oferta que entra (desbloqueos y airdrops) contra la demanda del hype inicial.

**Reglas** (TF diario, decisión a las 00:00 UTC):
- **Evento:** listado de un instrumento, es decir, su primera vela de 1h.
  - Se excluyen los que ya cotizaban al empezar los datos: primera vela antes de 2020-03-01.
  - Un ticker relistado con otra escala cuenta como listado nuevo, porque es otro activo.
- **Universo:** todos los perpetuos elegibles, no el top 100. Un listado nuevo tarda 30 días en entrar al ranking. Para el slippage se usa el peor tramo (10 bps).
- **Entrada:** **corto** al primer 00:00 UTC que sea ≥ listado + D días.
- **Salida:**
  - Por tiempo, a los H días.
  - Stop duro en entrada × 1,30. A x2, la liquidación queda en ~+49 %, así que el stop actúa antes.
- **Sin filtros.** Con más señales que cupos, entran en orden de llegada.

**Variantes:** D ∈ {1, 7} días × H ∈ {14, 28} días.

**Período in-sample:** 2020-03 → 2025-09. El walk-forward da ~7 tramos OOS, desde 2022-03.

## CARRY · Carry de funding (spot comprado + perpetuo vendido)

**Tesis.** El funding de los perpetuos USDT es positivo en promedio, porque los largos apalancados pagan para mantener su posición. Una posición neutra al precio (spot comprado + perpetuo vendido, mismo tamaño) cobra ese funding sin predecir nada. Activarla solo cuando el funding paga bien evita los períodos en que el cobro no cubre los costos.

**Reglas** (decisión diaria a las 00:00 UTC):
- **Señal:** funding acumulado de los últimos 7 días, anualizado (× 365/7).
- **Entrada:** si la señal supera T_in, se compra spot y se vende el perpetuo por el mismo tamaño. Precio: el open diario de cada mercado.
- **Salida:** si la señal baja de T_out = T_in / 3, se cierran las dos patas.
- **Tamaño:** 50 USDT de nocional por posición. Requiere 100 USDT de capital (50 de spot y 50 de margen del perpetuo a x1). Máximo 3 posiciones. Con más candidatos que cupos, gana el de mayor funding.
- **PnL:** funding cobrado por la pata corta en cada evento, más la variación de la **base** (perpetuo contra spot) entre la entrada y la salida, menos los costos de las 4 operaciones.
- **Liquidación de la pata corta** (x1, ~+98 %): si el máximo diario del perpetuo la alcanza, se cierran las dos patas a ese precio con una penalización del 1 % del nocional.
- **Spot equivalente:** mismo nombre, o sin el prefijo de escala ("1000PEPE" → "PEPE" × 1000). Los perpetuos sin spot no se pueden operar en carry.

**Variantes:** T_in ∈ {15 %, 30 %} × universo ∈ {BTC + ETH, top 30 con spot}.

**Período in-sample:** 2021-01 → 2025-09. El walk-forward da ~6 tramos OOS, desde 2023-01.

**Simplificaciones conocidas:**
- No se modela el riesgo de exchange ni el ADL. El 10/10/2025, Binance cerró por ADL los cortos ganadores, que eran justo la cobertura.
- No se modela el costo de oportunidad del capital inmovilizado.

---

## Resultados

*(vacío hasta correr `validate.ts --preset=POS|LIST|CARRY`)*
