// Métricas de un resultado de simulación. Todo neto de comisiones, slippage y funding.
// Con margen fijo (sin interés compuesto) los retornos se miden contra el capital inicial, y el
// Sharpe/Sortino salen de retornos DIARIOS (×√365), nunca de retornos por trade.
import type { SimResult, Trade } from "./engine/types.js";

export interface Metrics {
  trades: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
  /** Expectativa por trade en bps del notional. */
  expectancyBps: number;
  profitFactor: number;
  netPnl: number;
  totalReturnPct: number;
  annualReturnPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  /** Retorno anual / MDD. */
  mar: number;
  /** Comisiones pagadas, en % del capital inicial (el slippage va dentro de los precios de fill). */
  feesPct: number;
  fundingPnl: number;
  ambiguousPct: number;
  avgOpenPositions: number;
  avgBarsHeld: number;
  /** Proporción del PnL neto que aportó el 5 % de mejores trades. */
  top5PctShare: number;
  /** PnL neto sin los 3 instrumentos que más ganaron. */
  netPnlExTop3: number;
  exitReasons: Record<string, number>;
  byYear: { year: number; trades: number; netPnl: number; returnPct: number; maxDrawdownPct: number }[];
  skippedNoSlot: number;
  skippedNoMargin: number;
  skippedMinNotional: number;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Máximo drawdown (pico a valle) de una curva de equity, en % del pico. */
export function maxDrawdownPct(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd * 100;
}

export function dailyReturns(result: SimResult): number[] {
  const eq = result.equity;
  const base = result.config.initialEquity;
  const out: number[] = [];
  for (let k = 1; k < eq.length; k++) out.push((eq[k].equity - eq[k - 1].equity) / base);
  return out;
}

function profitFactor(trades: Trade[]): number {
  const gains = trades.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const losses = -trades.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0);
  return losses === 0 ? (gains > 0 ? Infinity : 0) : gains / losses;
}

export function computeMetrics(result: SimResult): Metrics {
  const { trades, equity, config } = result;
  const base = config.initialEquity;
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

  const rets = dailyReturns(result);
  const years = Math.max(equity.length - 1, 1) / 365;
  const downside = rets.filter((r) => r < 0);
  const downDev = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / Math.max(rets.length, 1));
  const totalReturnPct = (netPnl / base) * 100;
  const annualReturnPct = totalReturnPct / years;
  const mdd = maxDrawdownPct(equity.map((e) => e.equity));

  const sortedByPnl = [...trades].sort((a, b) => b.netPnl - a.netPnl);
  const top5 = sortedByPnl.slice(0, Math.max(1, Math.ceil(trades.length * 0.05)));
  const byInstrument = new Map<string, number>();
  for (const t of trades) byInstrument.set(t.instrument, (byInstrument.get(t.instrument) ?? 0) + t.netPnl);
  const top3Instruments = [...byInstrument.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);

  const exitReasons: Record<string, number> = {};
  for (const t of trades) exitReasons[t.exitReason] = (exitReasons[t.exitReason] ?? 0) + 1;

  const yearsSet = [...new Set(equity.map((e) => new Date(e.date).getUTCFullYear()))].sort();
  const byYear = yearsSet.map((year) => {
    const yt = trades.filter((t) => new Date(t.exitTime).getUTCFullYear() === year);
    const ye = equity.filter((e) => new Date(e.date).getUTCFullYear() === year).map((e) => e.equity);
    const pnl = yt.reduce((s, t) => s + t.netPnl, 0);
    return { year, trades: yt.length, netPnl: pnl, returnPct: (pnl / base) * 100, maxDrawdownPct: maxDrawdownPct(ye) };
  });

  return {
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    avgWinR: mean(wins.map((t) => t.rMultiple)),
    avgLossR: mean(losses.map((t) => t.rMultiple)),
    expectancyR: mean(trades.map((t) => t.rMultiple)),
    expectancyBps: mean(trades.map((t) => (t.netPnl / t.notional) * 10_000)),
    profitFactor: profitFactor(trades),
    netPnl,
    totalReturnPct,
    annualReturnPct,
    maxDrawdownPct: mdd,
    sharpe: std(rets) > 0 ? (mean(rets) / std(rets)) * Math.sqrt(365) : 0,
    sortino: downDev > 0 ? (mean(rets) / downDev) * Math.sqrt(365) : 0,
    mar: mdd > 0 ? annualReturnPct / mdd : 0,
    feesPct: (trades.reduce((s, t) => s + t.fees, 0) / base) * 100,
    fundingPnl: trades.reduce((s, t) => s + t.funding, 0),
    ambiguousPct: trades.length ? (trades.filter((t) => t.ambiguous).length / trades.length) * 100 : 0,
    avgOpenPositions: mean(equity.map((e) => e.openPositions)),
    avgBarsHeld: mean(trades.map((t) => t.barsHeld)),
    top5PctShare: netPnl !== 0 ? top5.reduce((s, t) => s + t.netPnl, 0) / netPnl : 0,
    netPnlExTop3: trades.filter((t) => !top3Instruments.includes(t.instrument)).reduce((s, t) => s + t.netPnl, 0),
    exitReasons,
    byYear,
    skippedNoSlot: result.skippedNoSlot,
    skippedNoMargin: result.skippedNoMargin,
    skippedMinNotional: result.skippedMinNotional,
  };
}

