// LIST · cortos a listados nuevos (pre-registrada en docs/investigacion/2026-10-06-tres-lineas.md).
//
// Tesis: los perpetuos recién listados caen en las semanas siguientes por la oferta que entra
// (desbloqueos, airdrops) contra la demanda del hype inicial.
//   Evento: primera vela de 1h del instrumento (los que ya cotizaban al empezar los datos se
//     excluyen: listado antes de 2020-03-01). Un relistado con otra escala cuenta como listado.
//   Entrada: corto al primer cierre diario (00:00 UTC) que sea ≥ listado + D días.
//   Salida: a los H días; stop duro en entrada × 1,30.
//   Universo: todos los perpetuos (un listado tarda 30 días en entrar al ranking).
import type { InstrumentData, Strategy } from "../engine/types.js";
import { DAY_MS } from "../data/candles.js";

/** Listados anteriores a esta fecha no se consideran nuevos (los datos arrancan en 2020-01). */
export const FIRST_ELIGIBLE_LISTING = Date.parse("2020-03-01T00:00:00Z");
export const LISTING_STOP_PCT = 0.3;

export interface ListingParams {
  delayDays: number;
  holdDays: number;
}

interface Prepared {
  /** Índice de la vela diaria en cuyo cierre se entra, o −1 si el instrumento no califica. */
  entryBar: number;
}

/** Primera vela diaria cuyo cierre (openTime + 1 día) es ≥ `t`. −1 si no hay. */
export function firstDailyCloseAtOrAfter(openTimes: Float64Array, t: number): number {
  for (let i = 0; i < openTimes.length; i++) if (openTimes[i] + DAY_MS >= t) return i;
  return -1;
}

export function listingShortStrategy(params: ListingParams): Strategy<Prepared> {
  const { delayDays, holdDays } = params;
  return {
    id: `LIST_d${delayDays}_h${holdDays}`,
    family: "baseline",
    timeframeHours: 24,
    side: "short",
    universe: "all",
    maxBars: holdDays,
    prepare(inst: InstrumentData): Prepared {
      const listed = inst.listedAt;
      if (listed === undefined || listed < FIRST_ELIGIBLE_LISTING) return { entryBar: -1 };
      return { entryBar: firstDailyCloseAtOrAfter(inst.tf.openTime, listed + delayDays * DAY_MS) };
    },
    // Sin prioridad propia: con más listados que cupos, desempata el id (orden estable).
    entry: (p, i) => (i === p.entryBar ? { score: 0 } : null),
    plan: (_p, _i, entryPrice) => ({ stop: entryPrice * (1 + LISTING_STOP_PCT) }),
  };
}
