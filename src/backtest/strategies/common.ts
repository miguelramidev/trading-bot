// Piezas compartidas por las estrategias: alineación de TF superior sin look-ahead y los modos
// de salida que se comparan (bracket actual, trailing nativo de Binance, trailing del bot).
import { clampCallbackRate, type Side } from "../engine/exits.js";
import type { ExitPlan, Series } from "../engine/types.js";
import { DAY_MS, HOUR_MS } from "../data/candles.js";
import { atr, rollingMax, rollingMin, sma } from "../indicators.js";

/**
 * Para cada vela i del TF de señal, índice de la última vela diaria CERRADA al cierre de i
 * (daily.openTime + 1d ≤ cierre de i). −1 si todavía no hay ninguna. Así un filtro diario nunca
 * usa la vela del día en curso.
 */
export function alignDaily(tf: Series, tfHours: number, daily: Series): Int32Array {
  const out = new Int32Array(tf.length).fill(-1);
  let k = -1;
  for (let i = 0; i < tf.length; i++) {
    const closeTime = tf.openTime[i] + tfHours * HOUR_MS;
    while (k + 1 < daily.length && daily.openTime[k + 1] + DAY_MS <= closeTime) k++;
    out[i] = k;
  }
  return out;
}

/** Filtro de régimen de BTC: cierre diario > SMA(period). Alineado al TF de señal. */
export function btcAboveSma(tf: Series, tfHours: number, btcDaily: Series, period: number): Uint8Array {
  const idx = alignDaily(tf, tfHours, btcDaily);
  const ma = sma(btcDaily.close, period);
  const out = new Uint8Array(tf.length);
  for (let i = 0; i < tf.length; i++) {
    const k = idx[i];
    out[i] = k >= 0 && btcDaily.close[k] > ma[k] ? 1 : 0;
  }
  return out;
}

export type ExitMode = "bracket" | "native_trail" | "bot_trail";

export interface ExitParams {
  mode: ExitMode;
  /** Stop inicial en ATR (en bracket es 1, como hoy). */
  stopAtr: number;
  /** bracket: TP en ATR (2, como hoy). native_trail: callback = m × ATR%. bot_trail: chandelier m × ATR. */
  m: number;
  /** Solo native_trail: el trailing se activa recién cuando el precio avanza `activateAtr` × ATR
   * a favor (`activatePrice` de Binance). Sin esto, trailea desde la entrada. */
  activateAtr?: number;
}

export function exitLabel(e: ExitParams): string {
  if (e.mode === "bracket") return `bracket${e.stopAtr}-${e.m}`;
  if (e.mode === "native_trail") return `ntrail${e.stopAtr}-${e.m}${e.activateAtr ? `-a${e.activateAtr}` : ""}`;
  return `btrail${e.stopAtr}-${e.m}`;
}

export interface ExitArrays {
  atr: Float64Array;
  /** Para el chandelier: máximo (long) o mínimo (short) de cierres de 22 velas. */
  extreme22: Float64Array;
}

export function exitArrays(tf: Series, side: Side): ExitArrays {
  return {
    atr: atr(tf.high, tf.low, tf.close, 14),
    extreme22: side === "long" ? rollingMax(tf.close, 22) : rollingMin(tf.close, 22),
  };
}

export function buildPlan(side: Side, e: ExitParams, a: ExitArrays, i: number, entryPrice: number): ExitPlan {
  const s = side === "long" ? 1 : -1;
  const atrNow = a.atr[i];
  const stop = entryPrice - s * e.stopAtr * atrNow;
  if (e.mode === "bracket") return { stop, takeProfit: entryPrice + s * e.m * atrNow };
  if (e.mode === "native_trail") {
    // El callback de Binance es un % fijo desde que se coloca: se fija con el ATR% de la entrada.
    const callbackRate = clampCallbackRate((e.m * atrNow) / entryPrice);
    const activatePrice = e.activateAtr ? entryPrice + s * e.activateAtr * atrNow : undefined;
    return { stop, trailing: { callbackRate, activatePrice } };
  }
  return { stop };
}

/** Chandelier del bot (solo modo bot_trail): extremo de 22 cierres ∓ m × ATR. */
export function botTrailStop(side: Side, e: ExitParams, a: ExitArrays, i: number): number | undefined {
  if (e.mode !== "bot_trail") return undefined;
  const s = side === "long" ? 1 : -1;
  const level = a.extreme22[i] - s * e.m * a.atr[i];
  return Number.isFinite(level) ? level : undefined;
}
