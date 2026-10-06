# Estrategia nueva de 1h: retroceso en tendencia con los filtros del bot actual

**Fecha:** 2026-10-06 · **Estado:** pre-registrada y aprobada por el usuario (filtro macro como veto) antes de correr; backtest sin correr.

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

*(vacío hasta correr `npx tsx src/backtest/validate.ts --preset=PB1H` y `--preset=PB1H_SIN`)*
