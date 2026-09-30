---
name: reglas-trading
description: >
  Usar esta skill antes de modificar cualquier lógica que afecte trading real:
  src/bot/trader.ts (executeTrade, escalado de apalancamiento, cleanOrphanOrders),
  src/cron/analyze.ts (monitoreo de SL/TP, pipeline de estrategias), cálculo o
  validación de apalancamiento (leverageMin/leverageMax) o de saldo/balance
  contra minNotional de Binance, colocación de órdenes de mercado + SL/TP,
  el callback del botón "✅ Ejecutar Sniper" en telegram/webhook.ts, o
  src/api/modules/signals/**/SignalController. También aplica si el cambio
  toca RULES.md directamente. NO aplica a cambios puramente de UI/Flutter,
  textos de Telegram sin lógica, o endpoints de solo lectura (dashboard,
  history, market data).
---

# Reglas de trading — antes de tocar esta lógica

Este código mueve dinero real en Binance Futures. Antes de escribir el
cambio, **leé `RULES.md`** completo (no está resumido acá a propósito: es
la única fuente de verdad y copiarlo la volvería obsoleta).

## Checklist antes de considerar el cambio terminado

1. **¿Respeta las Reglas 1 a 4 de RULES.md?**
   En particular la Regla 1 (escalado de apalancamiento: arranca en
   `leverageMin`, sube hasta `leverageMax` para cumplir `minNotional`, y si
   no alcanza **rechaza la orden** — nunca hacer un fallback silencioso con
   `Math.min` ni forzar la ejecución igual).

2. **¿Hay un test de vitest que cubra el caso que estás cambiando?**
   Si no existe, escribilo primero en `tests/**/*.test.ts` y verificá que
   falla contra el código viejo y pasa contra el nuevo. No es aceptable
   modificar esta lógica solo con prueba manual.

3. **¿Lo corriste con `pnpm test`?**
   Nada de `test-*.ts` / `check-*.ts` de la raíz (pegan contra Binance real),
   nada de `pnpm db:push` contra Neon de producción. Para los tests de
   vitest alcanza con:
   ```
   pnpm test
   ```
   `tests/setup.ts` (setupFiles global de Vitest) ya pone variables falsas
   para todo lo que se lee al importar (`ENCRYPTION_KEY`, `DATABASE_URL`,
   `TELEGRAM_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_B64`, etc.) y bloquea `fetch`
   global, así que `pnpm test` a secas ya es seguro por defecto: no hace
   falta `env -i` ni exportar nada a mano, y ningún test toca la red real
   aunque a algún mock le falte un método. Si un test necesita una variable
   puntual distinta, usá `vi.stubEnv()` dentro del test (no la agregues a
   `.env`); si importa un módulo nuevo que lee otra variable al cargarse,
   agregala a `tests/setup.ts`.

4. **¿Cómo se revierte si falla en producción?**
   El cambio tiene que ser reversible con un solo `git revert` o rollback de
   deploy — sin migraciones de schema a medio camino ni estado en Neon que
   quede inconsistente. Si toca `schema.ts`, documentá el paso de rollback
   explícitamente antes de pedir el deploy.

5. **¿Puede ejecutarse dos veces?**
   Si el cambio toca la ejecución de órdenes, verificá que un doble clic, un
   reintento de red o dos dispositivos abriendo el mismo signal no terminen
   abriendo dos posiciones. La dedupe por `update_id` en `telegram_updates`
   solo cubre reentregas de Telegram, no un doble toque real (ver hallazgo
   A1 en `ROADMAP.md`: falta reserva atómica de la señal antes de operar).

Si alguno de estos cinco puntos no se puede responder que sí, no está listo
para deploy — avisale al usuario en vez de asumir que está bien.
