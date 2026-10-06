// Grupos de corridas pre-registrados (docs/investigacion/2026-10-05-estrategias-1h-1d.md §6).
// Se definen ANTES de ver resultados: agregar variantes después de mirar un backtest es filtrar
// información del futuro. Cada corrida queda en el registro (registry.jsonl) para el Deflated
// Sharpe, incluidas las que fallen.
import type { Strategy } from "./engine/types.js";
import type { ExitParams } from "./strategies/common.js";
import { breakoutStrategy } from "./strategies/breakout.js";
import { rsi2PullbackStrategy } from "./strategies/rsi2Pullback.js";
import { rotationStrategy } from "./strategies/rotation.js";
import { pullback1hStrategy } from "./strategies/pullback1h.js";

// Los tres modos de salida que se comparan en todas las estrategias de tendencia.
const BRACKET: ExitParams = { mode: "bracket", stopAtr: 1, m: 2 }; // el actual del bot
const NATIVE_TRAIL: ExitParams = { mode: "native_trail", stopAtr: 2.5, m: 3 }; // TRAILING_STOP_MARKET
const BOT_TRAIL: ExitParams = { mode: "bot_trail", stopAtr: 2.5, m: 3 }; // chandelier, referencia
const EXITS = [BRACKET, NATIVE_TRAIL, BOT_TRAIL];
// Trailing nativo que se activa recién a +2 ATR: hasta ahí protege solo el stop inicial.
const NATIVE_TRAIL_ACTIVATED: ExitParams = { mode: "native_trail", stopAtr: 2.5, m: 3, activateAtr: 2 };

// Estrategia de 1h: SL 1,5 ATR y TP 3 ATR (la misma relación 1:2 de hoy, con ATR de 1h) contra
// el trailing del bot por ATR (mismo stop inicial, chandelier de 3 ATR movido cada hora).
const PB1H_EXITS: ExitParams[] = [
  { mode: "bracket", stopAtr: 1.5, m: 3 },
  { mode: "bot_trail", stopAtr: 1.5, m: 3 },
];
const PB1H_TRIGGERS = ["rsi2", "ema21"] as const;
const PB1H_ALL_FILTERS = { macro: true, funding: true, exposure: true };

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
  // Cortos, primera pasada exploratoria (cuando se iban a operar solo largos).
  SHORTS: () => [
    breakoutStrategy({ timeframeHours: 24, side: "short", n: 20, exit: NATIVE_TRAIL, btcSma: 0, dailyTrendFilter: false }),
    breakoutStrategy({ timeframeHours: 4, side: "short", n: 20, exit: NATIVE_TRAIL, btcSma: 0, dailyTrendFilter: true }),
    rsi2PullbackStrategy({ timeframeHours: 24, side: "short", l: 10, exitRule: "rsi70", stopAtr: 2.5, maxBars: 10 }),
  ],

  // --- Validación (pre-registrado el 2026-10-05, después de los primeros resultados, §10) ---
  // Pool de selección del walk-forward para largos: la grilla T1 completa más el trailing
  // nativo con activación a +2 ATR (la variante que podría evitar mover el stop a diario).
  LONG_WF: () => [
    ...PRESETS.T1(),
    ...[20, 55].map((n) =>
      breakoutStrategy({ timeframeHours: 24, side: "long", n, exit: NATIVE_TRAIL_ACTIVATED, btcSma: 0, dailyTrendFilter: false })
    ),
  ],
  // Opción A (2026-10-05, después de §11): los dos ítems de §6 que faltaban, SOLO sobre el T1 largo
  // con trailing del bot y sin tocar nada más (prioridad, stops, lookbacks): universo top 30 líquido
  // y filtro de fuerza relativa residual X1 (L {14, 28} días × top k {5, 10}). El pool del
  // walk-forward incluye también las variantes anteriores, para que la re-selección sea honesta.
  LONG_WF2: () => [
    ...PRESETS.LONG_WF(),
    ...[20, 55].map((n) =>
      breakoutStrategy({ timeframeHours: 24, side: "long", n, exit: BOT_TRAIL, btcSma: 0, dailyTrendFilter: false, maxRank: 30 })
    ),
    ...[14, 28].flatMap((lookbackDays) =>
      [5, 10].map((topK) =>
        breakoutStrategy({ timeframeHours: 24, side: "long", n: 20, exit: BOT_TRAIL, btcSma: 0, dailyTrendFilter: false, relativeStrength: { lookbackDays, topK } })
      )
    ),
  ],
  // Opción B (2026-10-05, aprobada por el usuario antes de correr nada, docs §13): rotación semanal
  // por fuerza relativa. Exactamente estas 4 variantes; las reglas fijas viven en rotation.ts.
  ROT: () => [
    rotationStrategy({ score: "residual", lookbackDays: 28, topK: 3 }), // R1, la central
    rotationStrategy({ score: "residual", lookbackDays: 14, topK: 3 }), // R2: ventana
    rotationStrategy({ score: "raw", lookbackDays: 28, topK: 3 }), // R3: tipo de ranking
    rotationStrategy({ score: "residual", lookbackDays: 28, topK: 5 }), // R4: cantidad de monedas
  ],
  // --- Estrategia de 1h (pre-registrada el 2026-10-06, docs/investigacion/2026-10-06-estrategia-1h.md) ---
  // Pool del walk-forward: los dos gatillos × las dos salidas que pidió el usuario, con los tres
  // filtros del bot actual (macro BTC, funding, exposición correlacionada). Exactamente estas 4.
  PB1H: () => PB1H_TRIGGERS.flatMap((trigger) => PB1H_EXITS.map((exit) => pullback1hStrategy({ trigger, exit, filters: PB1H_ALL_FILTERS }))),
  // Comparación (no compite en la selección): las mismas 4 sin ningún filtro, para medir cuánto
  // aportan los filtros en vez de suponerlo.
  PB1H_SIN: () => PB1H_TRIGGERS.flatMap((trigger) => PB1H_EXITS.map((exit) => pullback1hStrategy({ trigger, exit, filters: { macro: false, funding: false, exposure: false } }))),

  // Cortos evaluados en serio (decisión del usuario): misma comparación de salidas que los largos.
  SHORT_WF: () => [
    ...[20, 55].flatMap((n) =>
      [NATIVE_TRAIL, BOT_TRAIL].map((exit) => breakoutStrategy({ timeframeHours: 24, side: "short", n, exit, btcSma: 0, dailyTrendFilter: false }))
    ),
    breakoutStrategy({ timeframeHours: 4, side: "short", n: 20, exit: NATIVE_TRAIL, btcSma: 0, dailyTrendFilter: true }),
  ],
};
