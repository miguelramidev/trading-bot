// Grupos de corridas pre-registrados (docs/investigacion/2026-10-05-estrategias-1h-1d.md §6).
// Se definen ANTES de ver resultados: agregar variantes después de mirar un backtest es filtrar
// información del futuro. Cada corrida queda en el registro (registry.jsonl) para el Deflated
// Sharpe, incluidas las que fallen.
import type { Strategy } from "./engine/types.js";
import type { ExitParams } from "./strategies/common.js";
import { breakoutStrategy } from "./strategies/breakout.js";
import { rsi2PullbackStrategy } from "./strategies/rsi2Pullback.js";

// Los tres modos de salida que se comparan en todas las estrategias de tendencia.
const BRACKET: ExitParams = { mode: "bracket", stopAtr: 1, m: 2 }; // el actual del bot
const NATIVE_TRAIL: ExitParams = { mode: "native_trail", stopAtr: 2.5, m: 3 }; // TRAILING_STOP_MARKET
const BOT_TRAIL: ExitParams = { mode: "bot_trail", stopAtr: 2.5, m: 3 }; // chandelier, referencia
const EXITS = [BRACKET, NATIVE_TRAIL, BOT_TRAIL];

export const PRESETS: Record<string, () => Strategy<any>[]> = {
  // T1: Donchian 1d, long.
  T1: () =>
    [20, 55].flatMap((n) =>
      EXITS.map((exit) => breakoutStrategy({ timeframeHours: 24, side: "long", n, exit, btcSma: 0, dailyTrendFilter: false }))
    ),
  // T2: breakout 4h con filtro de tendencia diaria, long.
  T2: () =>
    [20, 55].flatMap((n) =>
      EXITS.map((exit) => breakoutStrategy({ timeframeHours: 4, side: "long", n, exit, btcSma: 0, dailyTrendFilter: true }))
    ),
  // M1: retroceso RSI(2) en tendencia, long.
  M1: () =>
    ([4, 24] as const).flatMap((timeframeHours) =>
      [5, 10].flatMap((l) =>
        (["rsi70", "sma5"] as const).map((exitRule) =>
          rsi2PullbackStrategy({ timeframeHours, side: "long", l, exitRule, stopAtr: 2.5, maxBars: 10 })
        )
      )
    ),
  // Cortos, solo como información (decisión del usuario: se opera solo largo).
  SHORTS: () => [
    breakoutStrategy({ timeframeHours: 24, side: "short", n: 20, exit: NATIVE_TRAIL, btcSma: 0, dailyTrendFilter: false }),
    breakoutStrategy({ timeframeHours: 4, side: "short", n: 20, exit: NATIVE_TRAIL, btcSma: 0, dailyTrendFilter: true }),
    rsi2PullbackStrategy({ timeframeHours: 24, side: "short", l: 10, exitRule: "rsi70", stopAtr: 2.5, maxBars: 10 }),
  ],
};
