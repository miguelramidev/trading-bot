// Lógica pura del modo sombra: replica en vivo POS (ls, 72 h) y CARRY (T15, top 30) con el MISMO
// código de indicadores y las mismas reglas que el backtest (docs/investigacion/2026-10-06-tres-lineas.md),
// para acumular resultados fuera de muestra sin operar. Nada de esto toca Binance ni la base.
import { buildUniverse, universeAt } from "../backtest/universe.js";
import { DAY_MS, HOUR_MS, type Candle } from "../backtest/data/candles.js";
import { toSeries } from "../backtest/data/load.js";
import { atr } from "../backtest/indicators.js";
import { rollingZ, sampleAtClose, MAX_METRIC_AGE_MS, POS_STOP_ATR, POS_THRESHOLD } from "../backtest/strategies/positioning.js";
import { trailingFundingAnnualized, CARRY_MAX_POSITIONS, SPOT_FEE_RATE } from "../backtest/strategies/carry.js";
import { DEFAULT_SIM_CONFIG } from "../backtest/engine/types.js";
import type { Side } from "../backtest/engine/exits.js";

export const POS_STRATEGY = "POS_ls_h18";
export const CARRY_STRATEGY = "CARRY_t15_top30";
export const POS_HOLD_MS = 18 * 4 * HOUR_MS;
export const POS_MAX_OPEN = DEFAULT_SIM_CONFIG.maxPositions;
export const CARRY_T_IN = 0.15;
export const CARRY_T_OUT = CARRY_T_IN / 3;
export const UNIVERSE_TOP = 30;
const TF_MS = 4 * HOUR_MS;

/** Velas ya cerradas a `now` (la última de Binance suele estar en curso). */
export function closedOnly(candles: Candle[], intervalMs: number, now: number): Candle[] {
  return candles.filter((c) => c.openTime + intervalMs <= now);
}

/**
 * Top N por mediana de quote volume de 30 días cerrados, con la misma función del backtest
 * (buildUniverse): historia mínima, sigue cotizando y no parece stablecoin.
 */
export function topByMedianVolume(daily: Map<string, Candle[]>, now: number, topN = UNIVERSE_TOP): { symbol: string; rank: number }[] {
  const closed = new Map([...daily].map(([s, c]) => [s, closedOnly(c, DAY_MS, now)] as const));
  const snap = universeAt(buildUniverse(closed, { topN, volumeWindowDays: 30, minHistoryDays: 30 }), now);
  return (snap?.ranked ?? []).map((symbol, k) => ({ symbol, rank: k + 1 }));
}

export interface PosReading {
  z: number;
  atr: number;
  /** Cierre de la vela de 4h evaluada (= momento de la señal). */
  barClose: number;
  /** Open de la vela de 4h siguiente, que ya empezó: el precio de entrada sin slippage. */
  entryOpen: number;
}

/** zLS y ATR de la última vela de 4h cerrada, igual que positioningStrategy.prepare. null si no hay datos suficientes. */
export function posReading(klines4h: Candle[], ratios: { time: number; ratio: number }[], now: number): PosReading | null {
  const closed = closedOnly(klines4h, TF_MS, now);
  if (closed.length < 20) return null;
  const last = closed[closed.length - 1];
  const next = klines4h.find((c) => c.openTime === last.openTime + TF_MS);
  if (!next) return null;
  const tf = toSeries(closed);
  const z = rollingZ(sampleAtClose(tf, 4, Float64Array.from(ratios, (r) => r.time), Float64Array.from(ratios, (r) => r.ratio), MAX_METRIC_AGE_MS));
  const a = atr(tf.high, tf.low, tf.close, 14);
  const i = closed.length - 1;
  if (!Number.isFinite(z[i]) || !(a[i] > 0)) return null;
  return { z: z[i], atr: a[i], barClose: last.openTime + TF_MS, entryOpen: next.open };
}

export interface PosCandidate extends PosReading {
  symbol: string;
  rank: number;
}

export interface PosEntry extends PosCandidate {
  side: Side;
  stop: number;
  exitDue: number;
}

/**
 * Entradas de POS como en el simulador: |z| > 2 (largos saturados → corto), prioridad por |z|
 * y después rank, sin repetir símbolos abiertos, hasta el cupo. Las que no entran se devuelven
 * aparte (se registran como "sin_cupo").
 */
export function decidePosEntries(cands: PosCandidate[], openSymbols: Set<string>, openCount: number, maxOpen = POS_MAX_OPEN): { enter: PosEntry[]; noSlot: PosEntry[] } {
  const thr = POS_THRESHOLD.ls;
  const signals: PosEntry[] = cands
    .filter((c) => !openSymbols.has(c.symbol) && Math.abs(c.z) > thr)
    .map((c) => {
      const side: Side = c.z > thr ? "short" : "long";
      const s = side === "long" ? 1 : -1;
      return { ...c, side, stop: c.entryOpen - s * POS_STOP_ATR * c.atr, exitDue: c.barClose + POS_HOLD_MS };
    })
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.rank - b.rank);
  const free = Math.max(0, maxOpen - openCount);
  return { enter: signals.slice(0, free), noSlot: signals.slice(free) };
}

export interface OpenPos {
  side: Side;
  entryTime: number;
  stop: number;
  exitDue: number;
}

/**
 * Salida de una posición de POS con velas de 1h desde la entrada, en el orden del simulador:
 * en la hora del vencimiento sale por tiempo al open; antes, el stop se resuelve con cada vela
 * cerrada (si abre más allá del stop, llena al open). null = sigue abierta.
 */
export function resolvePos(pos: OpenPos, bars1h: Candle[], now: number): { exitTime: number; rawExit: number; reason: "stop" | "time" } | null {
  const long = pos.side === "long";
  for (const b of bars1h) {
    if (b.openTime < pos.entryTime) continue;
    if (b.openTime >= pos.exitDue) return b.openTime <= now ? { exitTime: b.openTime, rawExit: b.open, reason: "time" } : null;
    if (b.openTime + HOUR_MS > now) return null; // vela en curso: todavía no se sabe
    if (long ? b.low <= pos.stop : b.high >= pos.stop) {
      const gap = long ? b.open <= pos.stop : b.open >= pos.stop;
      return { exitTime: b.openTime + HOUR_MS, rawExit: gap ? b.open : pos.stop, reason: "stop" };
    }
  }
  return null;
}

/** Slippage del simulador por rank (bps → fracción). */
export function slippage(rank: number): number {
  const tiers = DEFAULT_SIM_CONFIG.slippageTiers;
  const t = tiers.find((x) => rank <= x.maxRank) ?? tiers[tiers.length - 1];
  return t.bps / 10_000;
}

export interface PnlBreakdown {
  grossPct: number;
  costPct: number;
  fundingPct: number;
  netPct: number;
  entryFill: number;
  exitFill: number;
}

/** PnL en % del nocional con el modelo de costos del simulador (comisión taker, slippage, stops ×2, funding). */
export function posPnl(side: Side, rank: number, rawEntry: number, rawExit: number, reason: "stop" | "time", fundingRates: number[]): PnlBreakdown {
  const s = side === "long" ? 1 : -1;
  const slip = slippage(rank);
  const entryFill = rawEntry * (1 + s * slip);
  const exitFill = rawExit * (1 - s * slip * (reason === "stop" ? DEFAULT_SIM_CONFIG.stopSlippageMult : 1));
  const grossPct = s * (exitFill / entryFill - 1);
  const costPct = DEFAULT_SIM_CONFIG.feeRate * (1 + exitFill / entryFill);
  // Funding sobre el nocional (≈ precio de entrada): el largo paga el positivo, el corto lo cobra.
  const fundingPct = -s * fundingRates.reduce((a, b) => a + b, 0);
  return { grossPct, costPct, fundingPct, netPct: grossPct - costPct + fundingPct, entryFill, exitFill };
}

// --- CARRY ---

/** Funding de los últimos 7 días anualizado, igual que el backtest. */
export function carrySignal(rates: { time: number; rate: number }[], now: number): number {
  return trailingFundingAnnualized(Float64Array.from(rates, (r) => r.time), Float64Array.from(rates, (r) => r.rate), now);
}

export interface CarryCandidate {
  symbol: string;
  rank: number;
  signal: number;
}

/** Entradas y salidas de CARRY: sale si la señal cae bajo T_in/3 (o falta); entra si supera T_in, por señal y hasta 3. */
export function decideCarry(cands: CarryCandidate[], open: { symbol: string; signal: number }[]): { exit: string[]; enter: CarryCandidate[]; noSlot: CarryCandidate[] } {
  const exit = open.filter((o) => !(o.signal >= CARRY_T_OUT)).map((o) => o.symbol);
  const stay = open.length - exit.length;
  const openSet = new Set(open.map((o) => o.symbol));
  const signals = cands.filter((c) => !openSet.has(c.symbol) && c.signal > CARRY_T_IN).sort((a, b) => b.signal - a.signal || a.rank - b.rank);
  const free = Math.max(0, CARRY_MAX_POSITIONS - stay);
  return { exit, enter: signals.slice(0, free), noSlot: signals.slice(free) };
}

/** PnL del carry en % del nocional: base (spot − perpetuo) + funding cobrado − 4 comisiones y slippage. */
export function carryPnl(rank: number, perpEntry: number, perpExit: number, spotEntry: number, spotExit: number, fundingRates: number[]): PnlBreakdown {
  const slip = slippage(rank);
  const pe = perpEntry * (1 - slip);
  const se = spotEntry * (1 + slip);
  const px = perpExit * (1 + slip);
  const sx = spotExit * (1 - slip);
  const grossPct = (sx / se - 1) - (px / pe - 1);
  const costPct = 2 * (SPOT_FEE_RATE + DEFAULT_SIM_CONFIG.feeRate);
  const fundingPct = fundingRates.reduce((a, b) => a + b, 0);
  return { grossPct, costPct, fundingPct, netPct: grossPct - costPct + fundingPct, entryFill: pe, exitFill: px };
}
