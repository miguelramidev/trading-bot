# POS neutral al mercado — pre-registro

**Fecha:** 2026-10-07 · **Estado:** corrida. **No pasa: el efecto no aparece fuera del top 30.**

## Por qué

La prueba de POS en el holdout falló por la **caída** (51,4 % con costos ×2), no por falta de efecto. La verificación por deciles (`2026-10-06-tres-lineas.md`) mostró que el efecto que existe es **relativo**: las monedas con largos saturados rinden ~0,75–1 % menos **que el mercado** en 72 h. Del lado de los cortos saturados no hay efecto. La versión direccional cargaba además el movimiento de todo el mercado, y de ahí las caídas.

Objetivo del usuario: **no perder; buen rendimiento con control de la caída.** Se operaría con 33 USDT de prueba y se inyectaría capital si funciona.

## Tesis

Ir corto en la moneda con largos saturados y **largo en el mercado por el mismo monto** aísla el efecto relativo y quita casi todo el riesgo direccional.

## Reglas (una sola variante, sin parámetros a elegir)

- **Señal:** la misma de POS. zLS > 2,0 en la última vela de 4h cerrada (z-score de 30 días del ratio long/short de cuentas). **Solo ese lado**; no se toman cortos saturados.
- **Par:** corto en la moneda + largo en **ETHUSDT** por el **mismo nocional**.
  - Se usa ETH y no BTC porque, con 33 USDT, BTC exige 50 USDT de nocional mínimo y la Regla 1 lo rechazaría.
  - Si la señal es en ETH o BTC, no se opera.
- **Entrada:** al open de la vela de 1h siguiente al cierre de la vela de 4h.
- **Salida:**
  - A las **72 h** (18 velas de 4h), al open.
  - **Stop del par:** si la pérdida del par (−retorno de la moneda + retorno de ETH) llega a 2,5 × ATR%(14, 4h) de la moneda al entrar, se cierran las dos patas. Se evalúa al cierre de cada hora y se ejecuta al open siguiente.
  - **Liquidación** en aislado de cada pata con el máximo o mínimo de la vela de 1h: la pata liquidada pierde su margen y la otra se cierra al cierre de esa hora.
- **Una posición (un par) a la vez.** Con más de una señal, se toma la de mayor zLS (después, mejor rank).
- **Tamaño:**
  - **El 25 % del saldo del momento**, repartido en partes iguales entre las dos patas (12,5 % de margen cada una).
  - El apalancamiento sale de la Regla 1 (x1–x10): el mismo para las dos patas, lo justo para que las dos superen su nocional mínimo.
  - Si ni con x10 se llega, no se opera.
- **Costos:** taker de 0,05 % por lado en cada pata, slippage por rank (en el stop, ×2) y funding real de cada pata.

## Validación

- **Muestra de prueba:** monedas en el **puesto 31 a 60** del universo point-in-time. POS se armó y evaluó solo con el top 30, así que estas monedas nunca influyeron en una decisión.
- **Período:** 2022-02-01 → 2025-10-01, lo único que queda sin holdout. Es el mismo período de selección, así que la independencia es parcial: son otras monedas en el mismo mercado.
- **Capital inicial:** 33 USDT.

**Pasa si se cumplen los tres** (los mismos criterios del holdout):
1. Saldo final > 33 USDT **con costos ×2**.
2. Saldo final > 33 USDT **sin el mejor trade**, con costos ×1.
3. Peor caída ≤ **50 %**, con costos ×1 y ×2.

**Como referencia** (no decide nada) se informa la misma regla sobre el top 30.

**Qué sigue:**
- **Si pasa:** se suma al modo sombra (datos 2026-10 en adelante, nunca vistos) y se opera real solo después de 2–3 meses de sombra coherentes con el backtest.
- **Si falla:** se descarta.

## Resultados

**No pasa.** Falla los tres criterios en la muestra de prueba (monedas 31–60).

| Monedas 31–60 (decide) | Costos ×1 | Costos ×2 |
|---|---|---|
| Saldo final (desde 33 USDT) | 15,58 USDT (−53 %) | 15,79 USDT (−52 %) |
| Sin el mejor trade | 12,62 USDT | 12,63 USDT |
| Peor caída | 66,7 % | 62,1 % |
| Operaciones | 312 (1,6 por semana) | 225 |
| Apalancamiento medio | x5,3 | x6,6 |

| Top 30 (solo referencia) | Costos ×1 | Costos ×2 |
|---|---|---|
| Saldo final | 181,31 USDT | 136,84 USDT |
| Peor caída | 16,0 % | 19,7 % |

**¿Efecto ausente, o mecánica de capital chico?** En la prueba, a medida que bajaba el saldo, la pata de ETH (mínimo de 20 USDT) exigía más apalancamiento: entre 894 y 2.017 señales se rechazaron por la Regla 1, y desde 2024 casi no operó. Para separar las dos explicaciones se corrió la verificación por deciles, que no opera ni depende del capital, sobre las monedas 31–60 (, 238 mil observaciones):

| | Top 30 | Monedas 31–60 |
|---|---|---|
| D10 (largos más saturados), ajustado por mercado | −0,75 % | **−0,03 %** |
| zLS > +2, ajustado por mercado | −0,96 % | **−0,11 %** (t −1,3 sin corregir por superposición: no significativo) |

**El efecto no existe en las monedas 31–60.** No fue la mecánica del capital: fuera del top 30, la señal no predice nada.

Hay dos lecturas posibles:
- **Sobreajuste:** lo del top 30 fue suerte de la muestra en la que se descubrió.
- **Efecto propio de las monedas más líquidas:** el ratio de cuentas sería más informativo donde opera más gente.

La segunda es una explicación a posteriori, y con los datos 2022–2025 no se puede distinguir de la primera. La única prueba limpia que queda es el **modo sombra** (POS en el top 30, datos desde 2026-10), que ya está corriendo. **POS neutral queda descartada.**
