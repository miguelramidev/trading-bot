---
name: auditoria-trades
description: >
  Usar esta skill antes de analizar el historial de señales/trades
  (`signal_history`) para medir performance, calcular win rate,
  expectativa, profit factor, drawdown, o comparar estrategias/régimen/
  símbolo/horario. También aplica si el pedido es "cómo nos está yendo",
  "qué estrategia rinde mejor", o cualquier auditoría de resultados
  históricos. NO aplica a debugging de una señal puntual, ni a cambios de
  la lógica de trading en sí (para eso ver la skill reglas-trading).
---

# Auditoría de trades — metodología y reglas de acceso

## Acceso a datos: solo lectura, solo la rama analítica

- Usar **únicamente** `ANALYTICS_DATABASE_URL` (rama de Neon de solo
  lectura). **Nunca** `DATABASE_URL`.
- **Nunca leer ni mostrar el contenido de `.env`** (regla del `CLAUDE.md`
  raíz). El patrón correcto: un script en `scratch/` (gitignorado) que
  carga `dotenv/config` y lee `process.env.ANALYTICS_DATABASE_URL` dentro
  del proceso, corrido con `npx tsx scratch/<archivo>.ts`. La consola solo
  debe imprimir resultados de queries — nunca la connection string. Si un
  `catch` puede filtrarla en un mensaje de error, sanitizarlo antes de
  imprimir.
- Usar `sql.query(text, params)` del driver `@neondatabase/serverless`
  (no el template tag `sql\`...\``, que no acepta placeholders
  posicionales).
- Solo `SELECT`. Ninguna consulta de auditoría escribe en la base.

## Antes de calcular cualquier métrica: separar dos preguntas distintas

No mezclar nunca estos dos análisis en el mismo número:

1. **Calidad de la estrategia** — qué habría pasado si se operaban
   *todas* las señales que llegaron a un resultado (SL o TP tocado),
   sin importar si el usuario las tomó o las descartó. Responde "¿el
   motor de señales encuentra buenos setups?".
2. **Calidad de mis decisiones** — comparar el resultado de las señales
   `Tomada` contra las `Descartada` que también llegaron a SL/TP. Responde
   "¿el criterio manual de aceptar/rechazar agrega valor o lo resta?".

Reportar ambos por separado, nunca un número combinado. Si se comparan,
esa comparación es en sí misma el hallazgo (ej. "las descartadas
tuvieron mejor win rate que las tomadas" es una alerta sobre el criterio
de decisión, no sobre la estrategia).

## Filtro base para "calidad de la estrategia" (todas las señales con resultado)

```sql
WHERE decision LIKE '%Tocado%'   -- llegó a SL o TP, tomada o descartada
```

## Filtro base para "calidad de mis decisiones" / PnL real

```sql
WHERE decision LIKE 'Tomada%' AND realized_pnl IS NOT NULL
```

`realized_pnl` sale de `Trader.getTradeRealizedPnl()` (`src/bot/trader.ts`):
suma `realizedPnl` de cada fill de Binance y le resta el fee de trading
(`t.fee.cost`). **Incluye comisiones de trading, no incluye funding**
(los pagos/cobros de funding mientras la posición estuvo abierta no
pasan por `fetchMyTrades`). Si se reporta PnL, aclarar siempre: *"neto de
comisiones de trading, sin funding"*.

## Data quality — caveats obligatorios en cualquier informe

Verificar en el momento (los datos siguen creciendo) pero, a la fecha de
esta skill, confirmado con `git show`:

- **`account_balance` es `"0.00"` para toda fila desde el 2026-09-25**
  (commit `eff06ec`, fix de un `ReferenceError` introducido por el
  refactor multi-tenant `6e9a1484` del mismo día: antes del refactor
  `accountBalance: currentBinanceBalance.toFixed(2)` usaba un balance
  global de un solo usuario; al pasar a multi-tenant esa variable quedó
  fuera de alcance en el punto del insert, rompía el cron, y el fix
  hardcodeó `"0.00"` para no perder señales en vez de resolver el
  atributo por-usuario). Antes del 25/09 el campo trae saldo real.
  **Consecuencia: `realized_roi` no es confiable para ninguna señal
  cerrada desde el 25/09** (se aproxima como 20% de `account_balance`).
- **`decision` es global por señal, no por usuario** (`signal_history`
  no tiene ownership — ver `ROADMAP.md` hallazgo A3). Con un solo usuario
  activo no distorsiona, pero si se suma un segundo usuario deja de ser
  válido comparar "decisiones" sin cruzar con quién tenía la sesión.
- **El apalancamiento usado no se guarda por señal** (no hay columna;
  ver `ROADMAP.md` sección 14, "opción A"). No se puede reconstruir el
  tamaño de posición real ni el R histórico con precisión antes de que
  esa columna exista.
- **Artefactos de una feature "Shadow" ya removida del código** (hasta
  el 2026-09-22): filas con `decision` conteniendo `Shadow` o con
  `realized_pnl` no nulo en decisiones `Descartada` que no vienen de
  Binance real sino de un cálculo virtual de una versión anterior del
  pipeline. Excluir de "calidad de mis decisiones" a menos que el
  análisis sea específicamente sobre esa feature vieja.
- **Precios como `text`**: parsear con `parseFloat`, nunca comparar como
  string.

## Cobertura de la muestra — obligatorio en cada informe

Todo informe debe declarar, al principio:

- Rango de fechas cubierto (`MIN(evaluated_at)` – `MAX(evaluated_at)`) y
  **cantidad de días de mercado distintos** (`COUNT(DISTINCT
  date_trunc('day', evaluated_at))`), no solo el total de señales — un
  total alto puede venir de pocos días muy activos.
- Si algún día concentra una fracción desproporcionada de la muestra,
  investigar la causa antes de incluirlo sin marcar (ver ejemplo: el
  2026-09-22 concentró 158/602 señales — no fue un bug de señales
  repetidas del mismo símbolo ni un evento extremo de BTC, sino la
  combinación de: BTC en rango/transición todo el día disparando
  Macro Breakout (estrategia 3) y Rango (estrategia 2) en decenas de
  altcoins distintos, más el tope de 3 señales por corrida del cron
  (`analyze.ts`, `if (signalsFound >= 3) return`) alcanzado en casi
  todas las corridas de la tarde/noche). Un día así no es un bug a
  descartar, pero **si domina un segmento (por estrategia, símbolo u
  hora), decirlo explícitamente** en vez de dejar que infle silenciosamente
  el N de esa estrategia/hora.

## Métricas a calcular (sobre el filtro que corresponda)

- **Win rate** = trades con `realized_pnl > 0` / total del filtro.
- **Expectancy** = promedio de `realized_pnl` (USDT). En R-múltiplos solo
  cuando se pueda reconstruir el riesgo inicial en USDT de forma
  confiable (hoy limitado por la falta de apalancamiento guardado —
  ver el caveat de arriba).
- **Profit factor** = suma de `realized_pnl` positivos / |suma de
  negativos|.
- **Drawdown** sobre la curva de `realized_pnl` acumulado ordenada por
  `evaluated_at`. Aclarar que es "drawdown de PnL", no de equity real
  (no hay balance de cuenta confiable para eso, ver caveat de
  `account_balance`).
- **Resultado en R**: solo si el riesgo (distancia a `stopLoss`/`gridSL`)
  se puede reconstruir con confianza.

## Segmentación

Por `strategy`, `regime`, `symbol`, `direction`, y franja horaria de
`evaluated_at` (UTC). Cada corte siempre con su propio N — nunca solo el
agregado.

## Umbral de muestra insuficiente

- **N < 20**: marcar el segmento como **"no concluyente"** explícitamente
  en el informe, no omitirlo ni maquillarlo con el número solo.
- **N entre 20 y 50**: reportar la métrica junto con su intervalo de
  confianza (Wilson score para win rate, no el normal) y una advertencia
  de tamaño de muestra chico.
- **Nunca comparar dos segmentos entre sí** (ej. estrategia 1 vs.
  estrategia 3) si alguno de los dos tiene N < 20 — reportarlos por
  separado en ese caso, sin ranking.

## Checklist antes de entregar un informe

1. ¿Declaré el rango de fechas y los días de mercado cubiertos?
2. ¿Separé "calidad de la estrategia" de "calidad de mis decisiones"?
3. ¿Excluí las filas "Shadow" del cálculo de PnL real?
4. ¿Aclaré si el PnL/ROI reportado incluye comisiones (sí) y funding (no)?
5. ¿Marqué qué períodos no son confiables para ROI (`account_balance`
   desde el 25/09)?
6. ¿Cada segmento reportado tiene su N al lado, y los N < 20 están
   marcados como no concluyentes?
7. ¿Usé solo `ANALYTICS_DATABASE_URL`, nunca `DATABASE_URL`, y no leí
   ni imprimí el `.env`?
