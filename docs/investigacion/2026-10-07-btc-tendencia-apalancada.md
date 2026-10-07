# Tendencia en BTC con apalancamiento y aportes mensuales

**Fecha:** 2026-10-07 · Pedido del usuario. Script: `src/backtest/analysis/btcLeverageTrend.ts` (tests en `tests/btc-leverage-trend.test.ts`).

## Reglas

- **Señal:** largo en el perpetuo de BTC si el cierre diario está sobre la SMA de 200 días; afuera (en USDT) si está debajo. Decisión a las 00:00 UTC.
- **Capital:** 30 USDT iniciales más 30 USDT el día 1 de cada mes. Al abrir, nocional = saldo × apalancamiento; con cada aporte se agranda la posición para volver a ese apalancamiento.
- **Margen cruzado:** la liquidación se revisa hora por hora con el mínimo de cada vela, con un mantenimiento del 0,5 %. Si se liquida, se pierde todo el saldo.
- **Costos:** funding real de BTC, comisión taker de 0,05 % y slippage de 0,02 %.
- **Período:** 2020-08-01 → 2026-09-30, que incluye el auge de 2021, el desplome de 2022 y el ciclo 2023–2025. La regla (SMA 200) es la estándar, no optimizada.

## Resultado

Aportado en total: **2.220 USDT**.

| Estrategia | Saldo final | Ganancia | Peor caída | Liquidaciones | Funding pagado |
|---|---|---|---|---|---|
| **Mantener BTC (DCA spot)** | **5.053** | **+2.833** | 77 % | 0 | 0 |
| Tendencia x1 (perpetuo) | 4.043 | +1.823 | 70 % | 0 | 787 |
| Tendencia x2 | 4.382 | +2.162 | 100 % | 1 | 1.998 |
| Tendencia x5 | 987 | −1.233 | 100 % | 6 | 7.246 |
| Tendencia x10 | 1.109 | −1.111 | 100 % | 16 | 1.484 |
| Tendencia x20 | **0** | **−2.220** | 100 % | 32 | 1.839 |

**El mismo cálculo sin funding**, que es lo que pasaría con BTC spot (x1):

| | Con funding | Sin funding |
|---|---|---|
| x1 | 4.043 (caída 70 %) | **5.250 (caída 65 %)** |
| x2 | 4.382 | 6.408 (1 liquidación) |
| x3 | 3.694 | 6.730 (1 liquidación) |

El funding promedio de BTC en el período fue de **11,3 % anual sobre el nocional**. La tendencia está comprada justo cuando el funding es más alto (mercados alcistas), así que el costo efectivo es todavía mayor.

## Lectura

1. **El apalancamiento con perpetuos destruye el resultado:**
   - x5 y x10 pierden la mitad de lo aportado; x20 lo pierde **todo**, con 32 liquidaciones.
   - BTC se mueve 5–10 % en un día con frecuencia. A x10 eso liquida la cuenta, y a x20 basta un 4–5 %.
   - Además, el funding se come el retorno: a x5 se pagaron **7.246 USDT de funding** sobre 2.220 aportados.
2. **x2 tampoco le gana a mantener.** Una caída liquidó la cuenta una vez (mayo de 2021), y aun sin esa liquidación el funding se lleva casi todo el beneficio del apalancamiento.
3. **Lo único que mejora a mantener es la tendencia en spot, sin apalancamiento** (sin funding): 5.250 contra 5.053, con una caída menor (65 % contra 77 %). Es una mejora chica en retorno y moderada en riesgo.
4. **Para un retorno mayor, el apalancamiento con perpetuos no es el camino en BTC:** el costo de funding y el riesgo de liquidación superan la ganancia extra. Si alguna vez se apalanca, que sea bajo (≤ x2), con margen aislado y un stop, y aceptando que en estos datos igual no le ganó a mantener.
