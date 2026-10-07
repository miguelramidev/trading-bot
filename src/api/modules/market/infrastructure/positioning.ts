// Tablero de posicionamiento (GET /api/market/positioning): para cada moneda del universo del
// modo sombra (top 30 por mediana de volumen de 30 días), qué tan cargadas están las cuentas
// (zLS), el funding y si hay señal de POS, más el resumen del modo sombra. Usa el MISMO cálculo
// que el cron Shadow4h (src/shadow/), así lo que se ve es lo que el modo sombra registra.
import { POS_THRESHOLD } from "../../../../backtest/strategies/positioning.js";
import { carrySignal, CARRY_STRATEGY, CARRY_T_IN, POS_STRATEGY, TREND_STRATEGY, type PosCandidate } from "../../../../shadow/logic.js";

/** Candidatas del torneo (docs/investigacion/2026-10-07-torneo.md). "Solo cortos" es un corte de las filas de POS, no otra estrategia. */
export const POS_SHORTS_ONLY = `${POS_STRATEGY}_cortos`;
const TOURNAMENT: { strategy: string; pick: (r: ShadowSignalLite) => boolean }[] = [
  { strategy: POS_STRATEGY, pick: (r) => r.strategy === POS_STRATEGY },
  { strategy: POS_SHORTS_ONLY, pick: (r) => r.strategy === POS_STRATEGY && r.side === "short" },
  { strategy: CARRY_STRATEGY, pick: (r) => r.strategy === CARRY_STRATEGY },
  { strategy: TREND_STRATEGY, pick: (r) => r.strategy === TREND_STRATEGY },
];

export interface PositioningRow {
  symbol: string;
  rank: number;
  /** Saturación de cuentas: z-score de 30 días del ratio long/short (positivo = cargadas en largo). */
  z: number;
  ratio: number;
  price: number;
  fundingLast: number | null;
  /** Funding de los últimos 7 días anualizado (lo que cobraría un carry). */
  funding7dAnnual: number | null;
  /** Señal de POS: corto contra largos saturados, largo contra cortos saturados. */
  posSignal: "long" | "short" | null;
  /** El funding supera el umbral de entrada de CARRY. */
  carryActive: boolean;
}

export interface ShadowSignalLite {
  strategy: string;
  symbol: string;
  side: string;
  status: string;
  signalTime: Date;
  signalValue: string | null;
  entryTime: Date;
  entryPrice: string;
  stopPrice: string | null;
  exitDue: Date | null;
  exitTime: Date | null;
  exitReason: string | null;
  netPct: string | null;
}

export interface StrategySummary {
  strategy: string;
  open: number;
  closed: number;
  wins: number;
  /** Suma y promedio del neto en % del nocional de las posiciones virtuales cerradas. */
  netPctSum: number;
  netPctAvg: number | null;
  noSlot: number;
  since: string | null;
}

export interface PositioningView {
  generatedAt: string;
  barClose: string | null;
  thresholds: { pos: number; carryAnnual: number };
  rows: PositioningRow[];
  shadow: { summaries: StrategySummary[]; open: ShadowSignalLite[]; recent: ShadowSignalLite[] };
}

export function buildPositioningView(
  cands: PosCandidate[],
  funding: Map<string, { time: number; rate: number }[]>,
  shadowRows: ShadowSignalLite[],
  now: number
): PositioningView {
  const thr = POS_THRESHOLD.ls;
  const rows: PositioningRow[] = cands
    .map((c) => {
      const f = funding.get(c.symbol) ?? [];
      const annual = carrySignal(f, now);
      return {
        symbol: c.symbol,
        rank: c.rank,
        z: c.z,
        ratio: c.ratio,
        price: c.entryOpen,
        fundingLast: f.length ? f[f.length - 1].rate : null,
        funding7dAnnual: Number.isFinite(annual) ? annual : null,
        posSignal: c.z > thr ? ("short" as const) : c.z < -thr ? ("long" as const) : null,
        carryActive: Number.isFinite(annual) && annual > CARRY_T_IN,
      };
    })
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.rank - b.rank);

  const summaries = TOURNAMENT.map(({ strategy, pick }) => {
    const mine = shadowRows.filter(pick);
    const closed = mine.filter((r) => r.status === "cerrada");
    const nets = closed.map((r) => Number(r.netPct)).filter(Number.isFinite);
    const sum = nets.reduce((a, b) => a + b, 0);
    const first = mine.reduce<Date | null>((m, r) => (!m || r.signalTime < m ? r.signalTime : m), null);
    return {
      strategy,
      open: mine.filter((r) => r.status === "abierta").length,
      closed: closed.length,
      wins: nets.filter((n) => n > 0).length,
      netPctSum: sum,
      netPctAvg: nets.length ? sum / nets.length : null,
      noSlot: mine.filter((r) => r.status === "sin_cupo").length,
      since: first ? first.toISOString() : null,
    };
  });

  const byExitDesc = (a: ShadowSignalLite, b: ShadowSignalLite) => (b.exitTime?.getTime() ?? 0) - (a.exitTime?.getTime() ?? 0);
  return {
    generatedAt: new Date(now).toISOString(),
    barClose: cands.length ? new Date(Math.max(...cands.map((c) => c.barClose))).toISOString() : null,
    thresholds: { pos: thr, carryAnnual: CARRY_T_IN },
    rows,
    shadow: {
      summaries,
      open: shadowRows.filter((r) => r.status === "abierta").sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime()),
      recent: shadowRows.filter((r) => r.status === "cerrada").sort(byExitDesc).slice(0, 15),
    },
  };
}
