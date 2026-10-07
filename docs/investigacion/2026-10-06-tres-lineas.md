# Tres líneas nuevas: posicionamiento saturado, cortos a listados nuevos y carry de funding

**Fecha:** 2026-10-06 · **Estado:** corridas. Ninguna pasa los criterios pre-registrados; POS (ls, 72 h) queda como candidato para el holdout si el usuario lo decide (ver Resultados).

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

Corrida del 2026-10-06. Holdout intacto. **Según los criterios pre-registrados no pasa ninguna de las tres líneas.** Hay dos casi-aciertos, en POS y en CARRY, en los que la variante individual se ve bien pero el proceso de selección del walk-forward eligió otra.

### POS · posicionamiento saturado (2022-02 → 2025-09)

| Variante | Trades | Sharpe (×2) | Anual (×2) | MDD (MC p95) | Semestres + | Sin top 3 |
|---|---|---|---|---|---|---|
| ls, 24 h | 4.325 | 1,20 (0,44) | 16,4 % (6,0 %) | 13,5 % (19,2 %) | 3/4 | 57 % |
| **ls, 72 h** | 2.079 | **1,58 (1,29)** | **26,7 % (21,7 %)** | **7,1 % (16,9 %)** | 3/4 | 56 % |
| combo, 24 h | 2.296 | 0,19 (−0,26) | 2,3 % | 20,0 % (42,2 %) | 2/4 | negativo |
| combo, 72 h | 1.489 | 0,16 (−0,10) | 2,3 % | 20,2 % (49,9 %) | 1/4 | negativo |
| **Walk-forward OOS** | | **0,23 (−0,15)** | 4,3 % | 25,9 % (40,9 %) | 2/4 | |

- **El walk-forward falla por la selección.** En 2024-08 eligió `combo 24 h`, que perdió 41, y en 2025-02 eligió `ls 24 h`, que perdió 30.
- **La medida `ls` sola funciona con las dos duraciones.** La que suma funding y open interest (`combo`) no funciona.

**Chequeos sobre `ls 72 h`.** Se hicieron después de ver los resultados, así que no compiten ni cambian el veredicto.

- **Look-ahead.** Con las métricas atrasadas 1 h (preset `POS_CHECK`), el Sharpe baja de 1,58 a 1,18 y el anual de 26,7 % a 18,6 %. Sigue positivo, así que no depende de usar datos del futuro.
- **De dónde sale la ganancia.**
  - Bruto +300 USDT, costos −31, funding +24, neto +293.
  - **Bruto positivo todos los años:** 2022 +142, 2023 +42, 2024 +62, 2025 +54.
  - Positivo en los dos lados: largos +141, cortos +152.
  - 2022 lo explican los cortos, en el mercado bajista. Las ganancias siguientes son más chicas pero se sostienen.
  - Concentración: 156 monedas operadas. MYX aporta 76 (5 trades); sin MYX quedan +217.
  - El 70 % de las salidas son por tiempo.
- **Deflated Sharpe.**
  - Con N = 68: 0,00.
  - Sin las variantes de CARRY en la varianza de los trials (su volatilidad casi nula infla la dispersión): **0,015**.
  - Con 64 pruebas, un Sharpe de 1,58 en 3,7 años no se distingue de la suerte de elegir la mejor. **No está probado estadísticamente.**
  - La única evidencia limpia que queda posible es el holdout.

### LIST · cortos a listados nuevos (2020-03 → 2025-09)

| Variante | Trades | Sharpe (×2) | Anual | MDD (MC p95) | Semestres + |
|---|---|---|---|---|---|
| D1, H14 | 410 | 0,28 (0,21) | 3,7 % | 19,4 % (48,3 %) | 5/8 |
| D1, H28 | 311 | 0,16 (0,09) | 2,1 % | 18,5 % (58,2 %) | 3/8 |
| D7, H14 | 396 | 0,01 (−0,06) | 0,2 % | 31,7 % (59,9 %) | 5/8 |
| D7, H28 | 303 | −0,12 (−0,17) | −1,6 % | 35,2 % (66,8 %) | 5/8 |
| **Walk-forward OOS** | | **0,23 (0,16)** | 3,3 % | 21,3 % (47,4 %) | 4/8 |

**Descartada.** Los listados nuevos caen en promedio un poco, pero con squeezes que vuelven el drawdown inaceptable.

### CARRY · spot comprado + perpetuo vendido (2021-01 → 2025-09)

| Variante | Trades | Sharpe (×2) | Anual (×2) | MDD | Semestres + |
|---|---|---|---|---|---|
| T15, BTC + ETH | 15 | 6,13 (5,63) | 3,8 % (3,6 %) | 0,2 % | 5/6 |
| **T15, top 30** | 54 | 3,69 (3,29) | **8,0 % (7,3 %)** | 0,8 % | **6/6** |
| T30, BTC + ETH | 13 | 4,79 (4,40) | 2,9 % | 0,2 % | 2/6 |
| T30, top 30 | 38 | 4,55 (4,13) | 6,6 % (6,3 %) | 0,8 % | 3/6 |
| **Walk-forward OOS** | | **6,30 (5,08)** | **1,8 %** | 0,1 % | 6/6 |

- **No pasa el criterio de rendimiento** (> 4,1 % anual), y el Deflated Sharpe da 0,78.
- **El walk-forward elige por Sharpe:** siempre prefirió BTC + ETH, que tiene menos volatilidad y también rinde menos.
- **T15 top 30** rinde 8 % anual y es positiva en todos los semestres, pero no fue la elegida.
- **Lectura:** el carry es seguro pero chico. Con 300 USDT, 8 % anual son ~24 USDT por año.

### Conclusión y decisión pendiente

1. **LIST: descartada.**
2. **CARRY: no pasa como fue pre-registrada.** Es una alternativa de bajo riesgo y bajo rendimiento, comparable a una cuenta remunerada. Pasa a ser una decisión del usuario, no del backtest.
3. **POS (`ls 72 h`): el único candidato con ventaja económica coherente en todo el proyecto.** No pasó el walk-forward ni el Deflated Sharpe. Usar el holdout en él es una **excepción al protocolo** y la decide el usuario. Si se hace:
   - Se corre **una sola vez**, con solo esta variante y sus parámetros tal cual (sin el atraso de 1 h).
   - Criterio fijado antes de correr, sobre 2025-10 → 2026-09:
     - PnL neto positivo con costos ×2;
     - Sharpe ≥ 0,5 con costos ×1;
     - MDD ≤ 25 %.
   - Si pasa, 2–3 meses en modo sombra antes de usar dinero real.
   - Advertencia: con un año de datos, el error del Sharpe es de ~±1. Pasar no prueba la ventaja y fallar no la descarta del todo. Es la mejor evidencia limpia disponible.

### Verificación del mecanismo de POS (2026-10-06, sin costo de pruebas)

`src/backtest/analysis/posDeciles.ts`: retorno a 72 h por decil de zLS en el top 30 (2022-02 → 2025-09, 239 mil observaciones). Es descriptivo: no elige parámetros.

| Decil | zLS medio | Retorno ajustado por mercado (± EE) |
|---|---|---|
| D1 (más cortos) | −1,85 | +0,01 % (±0,07) |
| D2 | −1,12 | +0,27 % (±0,08) |
| D3 | −0,73 | +0,34 % (±0,07) |
| D4 | −0,39 | +0,16 % (±0,07) |
| D5 | −0,06 | −0,01 % (±0,08) |
| D6 | 0,28 | −0,02 % (±0,05) |
| D7 | 0,62 | +0,05 % (±0,06) |
| D8 | 0,99 | −0,19 % (±0,08) |
| D9 | 1,42 | −0,26 % (±0,06) |
| D10 (más largos) | 2,20 | **−0,75 % (±0,07)** |
| zLS > +2 | | **−0,96 % (±0,09)** |
| zLS < −2 | | +0,34 % (±0,16) |

D10 por año: −0,70 % (2022), −0,65 % (2023), −0,42 % (2024), −1,27 % (2025).

**Lectura:**

- **Largos saturados:** el mecanismo se confirma. Desde D7 el retorno baja de forma ordenada, y D10 es negativo los cuatro años. Las monedas con las cuentas muy cargadas en largo rinden ~0,75–1 % menos que el mercado en las 72 h siguientes.
- **Cortos saturados:** no se confirma. D1 está en cero; D2–D3 son algo positivos, pero sin la escalera que se ve del otro lado.
- **Errores estándar:** están agrupados por fecha, pero las ventanas de 72 h se superponen entre velas consecutivas, así que los EE están subestimados (×~4). Aun corregido, la cola de largos saturados sigue siendo significativa (t ≈ −2,7). La de cortos no (t ≈ 0,5).
- **Implicancia:**
  - La ventaja de POS está en **ir corto contra los largos saturados**. Los largos de la estrategia viven de otra cosa, o de suerte.
  - Además es una ventaja **relativa al mercado**: la estrategia, que no se cubre, también carga el movimiento de BTC, como en 2022.
  - Una versión "solo cortos" o "cubierta con BTC" sería una variante nueva, inspirada en este resultado. Si se prueba, cuenta como prueba y lo justo es validarla con datos nuevos (modo sombra), no con estos.

---

## Prueba en el holdout — pre-registro (2026-10-07, antes de correr)

Decisión del usuario: usar el holdout en **POS `ls`, 72 h**, como excepción al protocolo (no pasó el walk-forward ni el Deflated Sharpe), con la configuración con la que se operaría de verdad. Es la **única** prueba que se corre en este período. Si falla, no se prueba otra cosa acá.

**Configuración** (fija, sin variantes):
- Estrategia `POS_ls_h18`, sin cambios: zLS > 2 → corto, < −2 → largo, salida a 72 h y stop de 2,5 ATR(4h), top 30.
- Capital inicial **33 USDT**, **una posición a la vez**.
- Margen: el **25 % del saldo del momento** (interés compuesto).
- Apalancamiento con la Regla 1: x1 a x10, solo lo necesario para el notional mínimo.
- Período: **2025-10-01 → 2026-10-01** (holdout, nunca simulado).
- Comando: `run.ts --preset=POS_CHECK --from=2025-10-01 --to=2026-10-01 --holdout --equity=33 --max-positions=1 --fraction=0.25 --cost=1|2`. Se lee solo la fila `POS_ls_h18` (la variante con atraso de métricas no cuenta).

**Pasa si se cumplen los tres criterios:**
1. Saldo final > 33 USDT **con costos ×2**.
2. Saldo final > 33 USDT **sin el mejor trade**, con costos ×1, para no depender de un evento como MYX.
3. Peor caída ≤ **50 %**, con costos ×1 y con costos ×2.

**Advertencia anticipada:** con un año de datos el resultado es ruidoso. Pasar no prueba la ventaja, y fallar no la descarta del todo. Igual es la mejor evidencia limpia disponible, y el criterio no se discute después de verla.

**Qué sigue:**
- **Si pasa:** construir la ejecución (salida por tiempo, sizing por fracción en `RULES.md` con tests) mientras el modo sombra suma 4–8 semanas, y recién después operar real con una regla de corte.
- **Si falla:** no se opera esta estrategia.
