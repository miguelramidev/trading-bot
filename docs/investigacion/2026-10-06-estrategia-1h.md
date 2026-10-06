# Estrategia nueva de 1h: retroceso en tendencia con los filtros del bot actual

**Fecha:** 2026-10-06 · **Estado:** pre-registrada y aprobada por el usuario (filtro macro como veto) antes de correr. **Resultado: descartada, no pasa ningún criterio (§7).**

Este documento fija la tesis, las reglas, las variantes y los criterios de aceptación **antes** de ver cualquier resultado. Una vez corrido el backtest no se agregan variantes ni se mueven parámetros mirando los números (marco de [`PROMPT_GUIDE.md`](../../PROMPT_GUIDE.md) y §8 de [`2026-10-05-estrategias-1h-1d.md`](2026-10-05-estrategias-1h-1d.md)).

---

## 1. Contexto y decisiones del usuario (2026-10-06)

- La estrategia de 15m pierde: PF 0,85 en la auditoría del 2026-10-01 y ~31 % de aciertos reales con un R:R de 1:2. La tanda 4h/1d del 2026-10-05 (44 variantes) no encontró un edge robusto.
- El usuario decide un **cambio radical**: TF de **1h**, borrar las estrategias actuales y crear una nueva. Esto revierte la decisión del 05/10 de descartar 1h. Los riesgos que motivaron esa decisión siguen vigentes (ver §6).
- **Se conservan** los tres filtros del bot actual que el usuario considera útiles: **macro de BTC**, **correlación con BTC** y **funding extremo**.
- Familia: **retroceso en tendencia**.
- Direcciones: **largos y cortos**. Si la moneda tiene correlación positiva con BTC, manda la dirección de BTC. Si la correlación es negativa, la moneda se evalúa sola.
- Salidas: **dos pruebas**, SL/TP fijos y trailing por ATR.

## 2. Tesis

> A escala de 1h el precio tiende a revertir, y a escala de días sigue la tendencia. Entrar al final de un retroceso de 1h a favor de la tendencia de 4h captura la reversión de corto plazo sin pelear contra la tendencia.

Respaldo: el estudio de 2026 citado en §1 del documento del 05/10 encuentra reversión a horizonte de 1h, y la literatura de momentum (Liu, Tsyvinski y Wu) lo encuentra a escala de días o semanas. **En contra:** M1 (RSI(2) en 4h/1d, solo largos) no tuvo edge después de costos. Esta prueba se diferencia en el TF del gatillo (1h), en operar los dos lados y en sumar los filtros del bot.

## 3. Reglas (código: `src/backtest/strategies/pullback1h.ts`)

Todas usan solo velas cerradas. La entrada se ejecuta al open de la vela de 1h siguiente.

| Pieza | Regla |
|---|---|
| Universo | Top 100 por volumen, point-in-time (igual que la tanda anterior). |
| Tendencia de la moneda (4h) | Última vela de 4h cerrada: cierre > EMA50 **y** EMA50 por encima de la de 6 velas atrás (1 día) → alcista. El espejo → bajista. Si no, no se opera. |
| Gatillo **rsi2** (1h) | Tendencia alcista y RSI(2) < 10 → largo. Bajista y RSI(2) > 90 → corto. |
| Gatillo **ema21** (1h) | Tendencia alcista, el mínimo toca la EMA21 y el cierre queda por encima → largo. Espejo → corto. |
| Filtro macro BTC | Misma definición que `analyze.ts`. BTC diario ALCISTA si cierre > EMA200 y EMA20 > EMA50; BAJISTA si cierre < EMA200 y EMA20 < EMA50. Si la moneda tiene **correlación ≥ 0** con BTC, se veta el lado contrario al macro. Con correlación **negativa** no se mira a BTC. Si el macro no está definido, no veta. Sin correlación medible se asume positiva. |
| Correlación con BTC | Pearson de los **retornos** de 1h de los últimos 7 días (mínimo 120 pares). Producción hoy la calcula sobre precios, un bug (ROADMAP §18). |
| Filtro de funding | Igual que `analyze.ts`: veta el largo si el último funding liquidado es < −0,05 % y el corto si es > +0,05 %. |
| Filtro de exposición | Igual que `analyze.ts`: si la moneda tiene correlación > 20 %, no se abre si ya hay otra posición del mismo lado con correlación > 20 % (o BTC mismo). |
| Prioridad | Sin score propio: con más señales que cupos, gana la más líquida. |
| Salida **bracket** | SL 1,5 ATR(14) de 1h, TP 3 ATR (1:2, como hoy). |
| Salida **trailing** | Stop inicial 1,5 ATR. El bot lo mueve al cierre de cada hora a máx(22 cierres) − 3 ATR (corto: espejo). Solo puede mejorar. |

Cuenta y costos sin cambios respecto del 05/10:
- 300 USDT de capital, 6 USDT de margen fijo, x1–x10 con la Regla 1 y máximo 5 posiciones.
- Comisión taker de 0,05 % por lado, slippage por liquidez, funding real y liquidación en aislado.

## 4. Variantes (exactamente estas)

**Pool del walk-forward, preset `PB1H` (4 variantes, compiten en la selección):**

| | Gatillo | Salida | Filtros |
|---|---|---|---|
| A | rsi2 | bracket 1,5/3 | los tres |
| B | rsi2 | trailing 1,5/3 | los tres |
| C | ema21 | bracket 1,5/3 | los tres |
| D | ema21 | trailing 1,5/3 | los tres |

**Comparación, preset `PB1H_SIN` (4 variantes, no compiten):** las mismas cuatro sin ningún filtro. Responde a la pregunta "¿los filtros ayudan?" con datos.

**Diagnóstico, después del walk-forward (3 variantes, no compiten):** sobre la variante que más veces elija el walk-forward, apagar un filtro por vez (sin macro, sin funding, sin exposición), para ver cuál aporta.

**Presupuesto:** 44 (tanda del 05/10) + 11 = **55 variantes** sobre los mismos años. Todas cuentan para el Deflated Sharpe, incluidas las de comparación y diagnóstico.

## 5. Criterios de aceptación (los mismos del 05/10, no se relajan)

Sobre la curva OOS concatenada del walk-forward (24 meses in-sample / 6 out-of-sample, re-seleccionando en cada paso, período 2021-01 → 2025-09):

1. Sharpe OOS ≥ 1,0, y positivo con **costos ×2**.
2. Deflated Sharpe ≥ 0,95 con N = 55.
3. Percentil 95 del MDD en Monte Carlo ≤ 25 %.
4. Sin dependencia de cola: el PnL sin las 3 mejores monedas tiene que seguir siendo positivo.
5. Mayoría de semestres OOS positivos (no explicado por un solo tramo).

**Si no pasa:** se descarta la idea entera, sin retocar parámetros, y el bot de 15m sigue pausado. **Si pasa:** una sola corrida en el holdout (2025-10 → 2026-09), y después 1–3 meses en modo sombra (señales registradas, sin operar) antes de usar dinero real.

## 6. Riesgos conocidos antes de correr

- **Costos:** en 1h hay muchos más trades que en 4h/1d, y el costo pesa mucho más contra stops de 1,5 ATR de 1h. Con un stop de ~1–2 %, los ~0,2 % de ida y vuelta son ~10–20 % del riesgo por trade.
- **Confirmación manual:** el backtest entra al open de la hora siguiente. En la práctica la confirmación manual llega tarde, y la auditoría del 30/09 midió que esa demora le cuesta ~0,25–0,31 pp por trade a la de 15m. Si la estrategia pasa, la ejecución tendría que ser automática o tener un límite de edad corto. Es una decisión del usuario, no del backtest.
- **Antecedente en contra:** M1 (RSI(2) en 4h/1d) no tuvo edge.
- **Cambios que necesita el bot si pasa:**
  - Cron horario.
  - Mover el stop cada hora (variante trailing).
  - Corregir la correlación en `data.ts`.
  - Borrar las Estrategias 1/2/3 de `analyze.ts`.

  Todo pasa por la skill `reglas-trading` y tests primero.

## 7. Resultados

**Resultado: no pasa ningún criterio. La idea se descarta entera, sin retocar parámetros.**

Corrida del 2026-10-06:
- **Datos:** 678 perpetuos elegibles, 41.310 archivos verificados por checksum y sin errores. 594 instrumentos pasaron por el top 100.
- **Período:** 2021-01 → 2025-09. El holdout no se tocó.

### 7.1 Pool del walk-forward (`PB1H`, con los tres filtros)

| Variante | Trades | Sharpe (×2) | Anual | MDD (MC p95) | Semestres + |
|---|---|---|---|---|---|
| A rsi2 + bracket | 4.539 | −1,39 (−2,28) | −14,3 % | 71,7 % (108 %) | 0/6 |
| B rsi2 + trailing | 7.321 | −2,11 (−2,31) | −20,6 % | 98,0 % (132 %) | 0/6 |
| C ema21 + bracket | 5.251 | −2,01 (−2,60) | −18,4 % | 88,4 % (118 %) | 0/6 |
| D ema21 + trailing | 4.795 | −0,69 (−1,91) | −10,8 % | 81,4 % (112 %) | 1/6 |
| **Walk-forward OOS** | | **−2,12 (−3,24)** | **−21,7 %** | **60,1 % (85 %)** | **0/6** |
| *Umbral* | | *≥ 1,0* | | *p95 ≤ 25 %* | *mayoría* |

Deflated Sharpe 0,00 con N = 48 en ese momento (55 al final de la tanda). Ningún semestre fuera de muestra fue positivo.

### 7.2 Comparación sin filtros (`PB1H_SIN`)

Las cuatro variantes sin filtros pierden ~20 % anual y **quiebran la cuenta** (MDD 97–98 %). Desde 2024 ya no queda margen para operar, y por eso esos semestres figuran con PnL 0.

| | Sharpe | Trades | Neto (USDT) |
|---|---|---|---|
| D con filtros | −0,69 | 4.795 | −155 |
| D sin filtros | −1,05 | 8.914 | −294 (cuenta quebrada) |

### 7.3 Diagnóstico de filtros (`PB1H_ABL`, sobre la variante D)

| Variante | Trades | Sharpe | Anual | MDD |
|---|---|---|---|---|
| Con los tres | 4.795 | −0,69 | −10,9 % | 81,5 % |
| Sin macro | 7.072 | −0,62 | −11,8 % | 84,4 % |
| Sin funding | 4.934 | −1,61 | −18,7 % | 91,0 % |
| Sin exposición | 10.365 | −0,93 | −20,7 % | 98,9 % |

### 7.4 Por qué pierde (variante D, desglose de trades)

| | N | Bruto | Comisiones + slippage | Funding | Neto | R bruto medio | Costo medio en R |
|---|---|---|---|---|---|---|---|
| Todos | 4.795 | −76,5 | −68,6 | −9,7 | −154,8 | −0,027 | 0,046 |
| Largos | 3.473 | −78,4 | −49,4 | −4,4 | −132,2 | −0,057 | 0,045 |
| Cortos | 1.322 | +1,9 | −19,2 | −5,3 | −22,6 | +0,052 | 0,049 |

- **El retroceso de 1h no tiene ventaja antes de costos.** El R bruto medio es ~0. Cada trade paga ~0,05 R de comisión y slippage, y con miles de trades eso hunde la curva. Encaja con el riesgo anotado en §6 y con el fracaso de M1 en 4h/1d. Bajar a 1h no rescató la idea: la empeoró, porque multiplicó los trades.
- **Los años no son estables:**
  - 2025 fue positivo (+38,8).
  - 2023 y 2024 fueron muy negativos (−44 y −111).
- **Los filtros cortan pérdidas, pero no generan ventaja.**
  - Por qué ayudan: reducen a la mitad la cantidad de trades, y así la cuenta sobrevive en vez de quebrar. El R por trade casi no cambia (−0,027 contra −0,014 sin filtros). Ayudan porque se opera menos, no porque elijan mejores trades.
  - Funding: es el que más aporta (sacarlo baja el Sharpe de −0,69 a −1,61).
  - Exposición correlacionada: le sigue (sacarlo lo baja a −0,93).
  - Macro BTC: no muestra aporte (sin él, −0,62).
  - Advertencia: son diferencias entre variantes perdedoras, con 55 pruebas acumuladas. Es una lectura direccional, no una conclusión firme.

### 7.5 Conclusión

Según §5, **la estrategia de 1h queda descartada.** No se usa el holdout, no se implementa en el bot y no se borran las estrategias de 15m de `analyze.ts` para reemplazarlas por esta. Variantes acumuladas sobre 2021–2025: **55**.
