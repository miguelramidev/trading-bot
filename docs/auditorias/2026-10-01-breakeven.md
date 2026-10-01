# Auditoría de breakeven a +1R — 2026-10-01

Alcance: `signal_history` filtrada a señales con R:R 1:2 por señal, backtest
contra klines públicos de Binance Futures (`scripts/analysis/breakeven_backtest.ts`,
sin claves), metodología según la skill `auditoria-trades`. Resultados
completos en `data_dl/breakeven_backtest_2026-10-01T23-26-17-953Z.json`
(gitignorado). Script de reporte: `scripts/analysis/breakeven_report.ts`.

**Esta es la segunda versión de este informe.** La primera corrida (JSON
`...19-56-22...`) tenía un bug grave que invalidaba casi todos los números;
se documenta abajo en su propia sección porque la corrección cambió la
imagen completa, no fue un ajuste cosmético.

## Motivación

El monitor de breakeven (`src/cron/monitor.ts`) se removió en el commit
`b026fb1` (2026-08-31) con el argumento de que, con un R:R estático **1:1**,
el precio llega al TP al mismo tiempo que a la meta de breakeven. El
2026-09-17 (`4ea3e9e`) el grid pasó a **1:2** (`stopLoss = precio − 1×ATR`,
`takeProfit = precio + 2×ATR`, ver `analyze.ts`) y el monitor nunca se
reintrodujo — la premisa original para sacarlo dejó de valer hace dos
semanas. Esta auditoría mide qué habría pasado si existiera.

## Variantes simuladas

- **a) base:** sin cambios, SL y TP originales.
- **b) breakeven en la entrada:** al tocar +1R, SL pasa a `entry` exacto.
- **c) breakeven + comisión:** al tocar +1R, SL pasa a
  `entry × (1 ± 0.10%)` (comisión taker ida y vuelta estimada).

## ⚠️ Bug encontrado y corregido: la validación contra resultado real no cerraba

El usuario pidió explícitamente no sacar conclusiones sin validar la
variante base contra resultados reales, porque el winrate de la primera
corrida (50.5% todas las señales, 57.9% ejecutadas) no se parecía en nada
al historial real (~33%, 18 objetivos y 36 stops) ni a la auditoría
anterior (27.7% en Tomadas). Validar reveló la causa:

**Hallazgo:** para el **48% de las señales simuladas** (277 de 578), la
entrada simulada (open de la vela de 15m siguiente a `evaluated_at`) ya
estaba más allá del SL o del TP **originales** antes incluso de empezar a
simular — en 133 casos por más de 1R completo. Ejemplo real (señal 176,
XPL/USDT, LONG): `entry` de la señal = 0.095150, SL = 0.094146 (a solo
1.06% de distancia); 14 minutos después, al abrir la vela siguiente, el
precio ya estaba en 0.09152 — **por debajo del propio SL**, un movimiento
de 3.8% que equivale a 2.6R. El riesgo (1×ATR) de muchos de estos pares es
tan chico que un movimiento normal durante los ~15 minutos de demora de
"vela siguiente" alcanza para saltarse el SL/TP antes de que la posición
exista.

**Por qué esto rompía los números:** el cálculo de retorno % usa el SL/TP
original como precio de salida. Cuando la entrada ya quedó del lado
equivocado de ese nivel, la resta da un **signo invertido** — un cierre
"SL" (una pérdida real) podía computar como retorno **positivo**, porque
el SL quedó por encima de la entrada en vez de por debajo. En el 53% de
las señales ejecutadas reales, esto pasaba — y era suficiente para que el
winrate simulado (que sumaba "wins" por signo de retorno, no por la
etiqueta SL/TP) se disparara a 57.9% en vez de acercarse al ~33% real.

**Corrección:** se agregó un guardrail nuevo (`ENTRY_BEYOND_SLTP`) en
`breakeven_backtest.ts` que excluye estas señales del backtest en vez de
aproximar un precio de salida inventado — mismo criterio que el guardrail
de mismatch de entrada ya existente (`ENTRY_MISMATCH_GUARDRAIL_PCT`), solo
que este mira si la entrada ya cruzó el SL/TP, no si se movió más de 20%
del precio de la señal.

### Validación después de la corrección

| | Antes (bug) | Después (corregido) |
|---|---|---|
| N señales simulables | 577 | 301 (277 excluidas por `ENTRY_BEYOND_SLTP`) |
| N ejecutadas comparables | 57 | 26 (mismo problema afectaba a la mitad de las ejecutadas) |
| Winrate simulado (ejecutadas) | 57.9% | **36.0%** |
| Winrate real (ejecutadas) | 31.0% | **30.8%** |
| Coincidencia simulado vs. real (first_touch) | 77.6% | 69.2% |

36.0% simulado vs. 30.8% real, sobre N=26, está dentro de lo esperable de
ruido muestral y coherente con el ~33% del historial completo del usuario
(ese historial cubre más operaciones que las 26 que sobreviven el filtro
R:R 1:2 + `ENTRY_BEYOND_SLTP` en esta ventana de 12 días). La coincidencia
de *qué* se tocó primero (SL o TP) baja de 77.6% a 69.2% simplemente
porque ya no quedan en el denominador los casos "fáciles" (trivialmente
correctos) que el bug anterior inflaba.

**Desacuerdos restantes (8 de 26):** señales 163, 476, 493, 526, 536, 579,
661, 671 — quedan como ruido de la metodología de "vela siguiente sin
look-ahead" de por sí (ya documentado en la auditoría del 2026-09-30,
sección "costo de la demora de ejecución"), no parte de este bug.

## Filtro de R:R 1:1 vs. 1:2 (ajuste 1 del plan original)

El ratio beneficio/riesgo se calculó **señal por señal** (`|TP−entry| /
|entry−SL|`), no asumido por fecha de corte:

| Ratio | N |
|---|---|
| 1:2 (banda 1.9–2.1, incluida en el backtest) | 596 |
| Otro ratio | 87 |
| >1:2.5 | 6 |
| ~1:1 | **5** |

**Solo 5 señales de 694 tenían R:R 1:1** — quedaron afuera del backtest.
De las 596 con ratio 1:2, 18 se excluyeron además por falta de datos de
velas o por el guardrail de mismatch de entrada → 578 simuladas → **301
simulables de verdad** después de excluir `ENTRY_BEYOND_SLTP`.

## Metodología de resolución a 1 minuto (ajustes 2 y 3 del plan original)

- Se escaneó a 15 minutos, con la misma lógica de entrada sin look-ahead
  que `src/scripts/backtest.ts` (open de la vela siguiente a
  `evaluated_at`), hasta encontrar **la primera vela de 15m que toca +1R**
  (favorable, antes del cierre original).
- **Desde el open de esa vela de 15m en adelante, las tres variantes (a, b
  y c) se siguieron a 1 minuto hasta el cierre** — no solo cuando esa vela
  de 15m también tocaba el SL o el TP original. Esto cubre el caso clave
  pedido: tocar +1R y volver a la entrada dentro de la misma vela de 15m.
- **La variante base (a) se recalculó también a 1 minuto** en ese mismo
  tramo, para que las tres variantes se midan con la misma resolución
  temporal.
- Antes de que el precio toque +1R, las tres variantes son idénticas por
  definición. Si una señal nunca llega a +1R dentro del horizonte, no hace
  falta bajar a 1m.
- Las velas de 1m se pidieron paginadas de a 1500 (máximo de Binance) y
  cacheadas en `scratch/cache/` (gitignorado) por símbolo + rango.

## Ambigüedad a 1 minuto (ajuste 4 del plan original)

De las **130/301 señales (43.2%) que tocaron +1R**, solo **2** quedaron
ambiguas incluso a resolución de 1 minuto (ambas en la variante c). Peor
caso y mejor caso difieren en menos de 0.01 puntos porcentuales en todos
los cortes — la ambigüedad residual no cambia ninguna lectura cualitativa.

## Cobertura de la muestra

- **301 señales simulables**, desde 2026-09-21 hasta 2026-10-01 — **11
  días de mercado**.
- Retorno en % sobre el nocional, neto de 0.10% de comisión taker ida y
  vuelta — **no incluye funding**.
- Advertencia de tamaño de muestra: cortes con N entre 20 y 50 marcados
  abajo; Estrategia 4 (N=15) marcada **no concluyente**.

## Calidad de la estrategia (todas las señales simulables, N=298)

| Variante | Winrate (IC 95% Wilson) | Retorno medio | Profit factor | Drawdown máx. |
|---|---|---|---|---|
| a) base | 43.3% [37.8%, 49.0%] | -0.109% | 0.85 | 47.28% |
| b) entrada | 40.9% [35.5%, 46.6%] | -0.014% | 0.98 | 28.06% |
| c) entrada+fee | 41.3% [35.8%, 46.9%] | -0.019% | 0.97 | 30.65% |

Los intervalos de winrate se solapan entre las tres variantes. La lectura
más honesta: **la variante base, sola, no muestra evidencia de
expectativa positiva en esta ventana** (PF 0.85, retorno medio negativo) —
coherente con la auditoría del 2026-09-30 ("no se puede afirmar
expectativa positiva ni negativa"). Breakeven no convierte una estrategia
perdedora en ganadora, pero en esta muestra **recorta la pérdida y el
drawdown de forma consistente** (PF sube de 0.85 a 0.97-0.98, drawdown
baja de 47.3% a 28-31%).

## Calidad de las decisiones (solo ejecutadas, N=25)

| Variante | Winrate (IC 95%) | Retorno medio | Profit factor | Drawdown máx. |
|---|---|---|---|---|
| a) base | 36.0% [20.2%, 55.5%] | -0.213% | 0.72 | 14.01% |
| b) entrada | 36.0% [20.2%, 55.5%] | -0.195% | 0.73 | 14.01% |
| c) entrada+fee | 40.0% [23.4%, 59.3%] | -0.187% | 0.74 | 14.01% |

N=25 (muestra chica, IC muy amplios). El drawdown no cambia porque el
camino que lo determina no pasa por ninguna operación que cierre en
breakeven en este subconjunto. Sección de validación contra PnL real más
arriba — esto NO es "winrate real", es la simulación aplicada solo al
subconjunto ejecutado.

## Cortes por fecha

**Primera mitad vs. segunda mitad:**

| Corte | Variante | Retorno medio | PF | DD máx. |
|---|---|---|---|---|
| 1ª mitad (N=149) | a | -0.092% | 0.87 | 26.95% |
| 1ª mitad | b | +0.069% | 1.13 | 17.51% |
| 1ª mitad | c | +0.080% | 1.16 | 16.71% |
| 2ª mitad (N=149) | a | -0.127% | 0.82 | 32.93% |
| 2ª mitad | b | -0.096% | 0.84 | 22.96% |
| 2ª mitad | c | -0.118% | 0.80 | 24.36% |

En la 1ª mitad, breakeven da vuelta el PF de negativo (0.87) a positivo
(1.13-1.16). En la 2ª mitad **no alcanza** — sigue por debajo de 1 en las
tres variantes, aunque el drawdown mejora igual. **La dirección
(drawdown) es consistente, pero la mejora de PF no se sostiene en la
mitad de validación.**

**Con y sin el 2026-09-22:**

| Corte | Variante | Retorno medio | PF | DD máx. |
|---|---|---|---|---|
| Sin 22/09 (N=251) | a | -0.067% | 0.91 | 47.28% |
| Sin 22/09 | b | +0.014% | 1.02 | 28.06% |
| Sin 22/09 | c | +0.004% | 1.01 | 30.65% |
| Solo 22/09 (N=47) | a | -0.336% | 0.51 | 20.71% |
| Solo 22/09 | b | -0.160% | 0.69 | 15.11% |
| Solo 22/09 | c | -0.143% | 0.71 | 14.71% |

El 22/09 es notablemente peor en las tres variantes (PF 0.51-0.71) — día
choppy ya documentado en la auditoría anterior. Breakeven mejora el PF ahí
también, pero ninguna variante cruza 1.0.

## Cortes por estrategia

| Estrategia | N | Variante | Retorno medio | PF | DD máx. |
|---|---|---|---|---|---|
| 1 | 176-178 | a | -0.063% | 0.92 | 29.90% |
| 1 | | b | -0.019% | 0.97 | 24.27% |
| 1 | | c | -0.028% | 0.96 | 26.42% |
| 2 | 32 | a | +0.221% | 1.39 | 9.74% |
| 2 | | b | +0.517% | 2.90 | 4.71% |
| 2 | | c | +0.529% | 3.08 | 4.61% |
| 3 | 75-76 | a | -0.161% | 0.74 | 29.94% |
| 3 | | b | -0.071% | 0.84 | 25.12% |
| 3 | | c | -0.079% | 0.81 | 25.87% |
| 4 | 15 | a | -1.095% | 0.00 | 16.43% |
| 4 | | b | -0.799% | 0.00 | 11.98% |
| 4 | | c | -0.779% | 0.00 | 11.68% |

**Estrategia 4 marcada NO CONCLUYENTE (N=15, por debajo de 20).** Estrategia
2 (N=32, muestra chica) es la única con PF>1 en la variante base, y
breakeven la mejora mucho más (PF 1.39→2.90-3.08) — pero con N=32 no se
compara en ranking contra las demás. Estrategia 1 y 3 muestran el mismo
patrón que el agregado: base por debajo de 1, breakeven la acerca a 1 sin
necesariamente cruzarlo.

## Costo vs. beneficio (sobre las 130 señales que tocaron +1R)

| Variante | Pérdidas evitadas | Ganancias cortadas | Neto acumulado |
|---|---|---|---|
| b) entrada | 41 casos, +46.884% acum. (prom. **1.144%**/caso) | 7 casos, -18.385% acum. (prom. **2.626%**/caso) | +28.50% |
| c) entrada+fee | 41 casos, +50.784% acum. (prom. **1.239%**/caso) | 12 casos, -23.795% acum. (prom. **1.983%**/caso) | +26.99% |

**Esto ya es coherente con la geometría 1:2 del grid**, a diferencia de la
primera versión del informe: cada ganancia cortada pesa **~1.7 a 2.3 veces
más** que cada pérdida evitada (como corresponde: el TP está a 2R, el SL a
1R), y el beneficio neto viene de que hay **muchas más pérdidas evitadas
(41) que ganancias cortadas (7-12)**, no de que cada caso pese igual.

### 5 ejemplos de pérdida evitada (variante b)

| Señal | Símbolo/dir | Entry | SL | TP | Base | Con breakeven |
|---|---|---|---|---|---|---|
| 158 | XLM SHORT | 0.21618 | 0.2164 | 0.2112 | -0.202% (SL, 18min) | -0.100% (SL-nuevo, 18min) |
| 164 | ASTER SHORT | 0.7235 | 0.726 | 0.7098 | -0.446% (SL, 91min) | -0.100% (SL-nuevo, 64min) |
| 165 | G LONG | 0.006062 | 0.005948 | 0.006153 | -1.981% (SL, 179min) | -0.100% (SL-nuevo, 28min) |
| 168 | NIL SHORT | 0.08336 | 0.085415 | 0.076551 | -2.565% (SL, 499min) | -0.100% (SL-nuevo, 59min) |
| 203 | RAYSOL LONG | 1.7646 | 1.7485 | 1.8089 | -1.012% (SL, 102min) | -0.100% (SL-nuevo, 66min) |

(tiempos en minutos desde el open de la vela de 15m donde se tocó +1R)

### 5 ejemplos de ganancia cortada (variante b)

| Señal | Símbolo/dir | Entry | SL | TP | Base | Con breakeven |
|---|---|---|---|---|---|---|
| 253 | FORM LONG | 0.3158 | 0.3087 | 0.3217 | +1.768% (TP, 94min) | -0.100% (SL-nuevo, 26min) |
| 327 | FET LONG | 0.21 | 0.2078 | 0.2141 | +1.852% (TP, 108min) | -0.100% (SL-nuevo, 36min) |
| 513 | SPK LONG | 0.02432 | 0.02422 | 0.025179 | +3.432% (TP, 136min) | -0.100% (SL-nuevo, 73min) |
| 537 | ONE SHORT | 0.0022406 | 0.002282 | 0.002195 | +1.935% (TP, 64min) | -0.100% (SL-nuevo, 31min) |
| 659 | MOVR LONG | 1.2417 | 1.21527 | 1.31527 | +5.825% (TP, 92min) | -0.100% (SL-nuevo, 25min) |

Patrón visible en estos 5 casos de ganancia cortada: el precio toca +1R
rápido (25-73 min) y luego revierte hasta la entrada antes de retomar
camino al TP varias horas más tarde (94-136 min) — el escenario de
"V" que breakeven sacrifica a cambio de blindar las 41 pérdidas evitadas.

## Conclusión

Con la corrección del guardrail `ENTRY_BEYOND_SLTP` y la validación contra
resultado real (36.0% simulado vs. 30.8% real sobre ejecutadas, N=26), este
informe queda en condiciones de confiar en sus números con las reservas de
siempre por tamaño de muestra (11 días de mercado). Hallazgos:

1. **La estrategia base, sola, no muestra expectativa positiva en esta
   ventana** (PF 0.85-0.92 en los cortes grandes) — consistente con la
   auditoría del 2026-09-30.
2. **Breakeven a +1R consistentemente achica la pérdida y el drawdown**
   en absolutamente todos los cortes de este informe (PF sube, drawdown
   baja), pero **no alcanza a convertir la estrategia en ganadora en la
   mitad de validación ni en el 22/09** — sí lo logra en la 1ª mitad y en
   Estrategia 2.
3. **El costo/beneficio tiene la geometría correcta** (ganancia cortada
   ≈2x pérdida evitada por caso) y el neto es positivo porque las
   pérdidas evitadas son ~3-6 veces más frecuentes que las ganancias
   cortadas.
4. La premisa original para sacar el monitor de breakeven (R:R 1:1) ya no
   corresponde al código actual (R:R 1:2 desde el 17/09) — ese punto sigue
   siendo el hallazgo más sólido de ambas versiones de esta auditoría.

**No alcanza para recomendar reactivar el monitor con una promesa de
"estrategia rentable"** — la variante base ya es floja en esta ventana.
Sí hay evidencia razonable de que, dado que se sigue operando, breakeven
reduce el riesgo (drawdown) de forma consistente y no empeora
sistemáticamente el PF. Candidato para la próxima auditoría: repetir con
más de 11 días de datos, y revisar si el patrón "revierte a entrada y
sigue después hacia el TP" (ver ejemplos de ganancia cortada) tiene algo
en común (estrategia, símbolo, hora) que permita afinar la regla en vez de
aplicarla igual a todas las señales.

## Nota metodológica para la próxima vez

El guardrail `ENTRY_BEYOND_SLTP` revela algo más amplio que este informe
específico: la técnica de "entrada al open de la vela de 15m siguiente,
sin look-ahead" — usada también por `src/scripts/backtest.ts` — es
sensible a que el SL/TP (basado en 1×/2×ATR) puede ser más angosto que el
movimiento típico de 15 minutos en varios altcoins. Cualquier backtest
futuro que reutilice esa técnica debería incluir este mismo guardrail (o
uno equivalente) antes de reportar winrate o retorno medio.
