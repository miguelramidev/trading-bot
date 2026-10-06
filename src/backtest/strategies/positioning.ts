// POS · posicionamiento saturado, contrarian (pre-registrada en
// docs/investigacion/2026-10-06-tres-lineas.md).
//
// Tesis: cuando las cuentas están muy cargadas de un lado (y el funding lo confirma), el movimiento
// siguiente tiende a ir contra ese lado.
//   Muestreo: en cada vela de 4h, la última fila de métricas conocida a su cierre (si tiene más
//     de 1 h de antigüedad, no hay dato).
//   zLS: z-score del ratio long/short de cuentas; zF: z del promedio de los últimos 3 funding;
//     zOI: z del cambio log del open interest en 18 velas (3 días). Ventana de 180 velas (30 días).
//   Saturación: "ls" → C = zLS (umbral 2,0); "combo" → C = (zLS + zF)/2 con zOI > 0 (umbral 1,5).
//   Entrada: C > umbral → corto; C < −umbral → largo. Salida a las H velas; stop 2,5 ATR(4h).
//   Universo: top 30 point-in-time.
import type { Side } from "../engine/exits.js";
import type { InstrumentData, Series, Strategy } from "../engine/types.js";
import { HOUR_MS } from "../data/candles.js";
import { atr } from "../indicators.js";

export const Z_WINDOW = 180;
/** Valores válidos mínimos dentro de la ventana para que el z-score cuente. */
export const Z_MIN_VALID = 120;
export const OI_CHANGE_BARS = 18;
export const MAX_METRIC_AGE_MS = HOUR_MS;
const STOP_ATR = 2.5;
const TF_HOURS = 4;

export interface PositioningParams {
  measure: "ls" | "combo";
  holdBars: number;
  /** Chequeo de robustez (no es una variante a elegir): ignorar las filas de métricas de los
   * últimos `lagMinutes` antes del cierre, por si Binance las publica con demora respecto de
   * create_time. 0 = como el pre-registro. */
  lagMinutes?: number;
}

export interface PositioningPrepared {
  c: Float64Array;
  zOI: Float64Array;
  atr14: Float64Array;
}

/** Último valor de `values` con `time` ≤ cierre de cada vela, si no tiene más de `maxAge`. NaN si no hay. */
export function sampleAtClose(tf: Series, tfHours: number, time: Float64Array, values: Float64Array, maxAge: number, lagMs = 0): Float64Array {
  const out = new Float64Array(tf.length).fill(NaN);
  let k = -1;
  for (let i = 0; i < tf.length; i++) {
    const cutoff = tf.openTime[i] + tfHours * HOUR_MS - lagMs;
    while (k + 1 < time.length && time[k + 1] <= cutoff) k++;
    if (k >= 0 && cutoff - time[k] <= maxAge) out[i] = values[k];
  }
  return out;
}

/** z-score de x[i] contra las `window` observaciones que terminan en i, ignorando NaN. */
export function rollingZ(x: Float64Array, window = Z_WINDOW, minValid = Z_MIN_VALID): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  let n = 0, s = 0, ss = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i])) { n++; s += x[i]; ss += x[i] * x[i]; }
    const j = i - window;
    if (j >= 0 && Number.isFinite(x[j])) { n--; s -= x[j]; ss -= x[j] * x[j]; }
    if (n >= minValid && Number.isFinite(x[i])) {
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, ss / n - mean * mean));
      if (sd > 0) out[i] = (x[i] - mean) / sd;
    }
  }
  return out;
}

/** Promedio de los últimos `count` eventos de funding liquidados al cierre de cada vela. */
export function recentFundingMean(tf: Series, tfHours: number, funding: InstrumentData["funding"], count = 3): Float64Array {
  const out = new Float64Array(tf.length).fill(NaN);
  let k = -1;
  for (let i = 0; i < tf.length; i++) {
    const close = tf.openTime[i] + tfHours * HOUR_MS;
    while (k + 1 < funding.time.length && funding.time[k + 1] <= close) k++;
    if (k + 1 >= count) {
      let sum = 0;
      for (let j = k - count + 1; j <= k; j++) sum += funding.rate[j];
      out[i] = sum / count;
    }
  }
  return out;
}

export function positioningStrategy(params: PositioningParams): Strategy<PositioningPrepared> {
  const { measure, holdBars } = params;
  const lagMs = (params.lagMinutes ?? 0) * 60_000;
  const threshold = measure === "ls" ? 2.0 : 1.5;
  return {
    id: `POS_${measure}_h${holdBars}${lagMs ? `_lag${params.lagMinutes}m` : ""}`,
    family: "reversion",
    timeframeHours: TF_HOURS,
    side: "both",
    maxRank: 30,
    maxBars: holdBars,
    needsMetrics: true,
    prepare(inst: InstrumentData): PositioningPrepared {
      const tf = inst.tf;
      const n = tf.length;
      const m = inst.metrics;
      const ls = m ? sampleAtClose(tf, TF_HOURS, m.time, m.lsAccount, MAX_METRIC_AGE_MS, lagMs) : new Float64Array(n).fill(NaN);
      const oi = m ? sampleAtClose(tf, TF_HOURS, m.time, m.openInterest, MAX_METRIC_AGE_MS, lagMs) : new Float64Array(n).fill(NaN);
      const oiChange = new Float64Array(n).fill(NaN);
      for (let i = OI_CHANGE_BARS; i < n; i++) {
        if (oi[i] > 0 && oi[i - OI_CHANGE_BARS] > 0) oiChange[i] = Math.log(oi[i] / oi[i - OI_CHANGE_BARS]);
      }
      const zLS = rollingZ(ls);
      const zF = rollingZ(recentFundingMean(tf, TF_HOURS, inst.funding));
      const zOI = rollingZ(oiChange);
      const c = new Float64Array(n);
      for (let i = 0; i < n; i++) c[i] = measure === "ls" ? zLS[i] : (zLS[i] + zF[i]) / 2;
      return { c, zOI, atr14: atr(tf.high, tf.low, tf.close, 14) };
    },
    entry(p, i) {
      const c = p.c[i];
      if (!Number.isFinite(c) || !(p.atr14[i] > 0)) return null;
      if (measure === "combo" && !(p.zOI[i] > 0)) return null;
      let side: Side;
      if (c > threshold) side = "short";
      else if (c < -threshold) side = "long";
      else return null;
      // Prioridad: la saturación más extrema primero.
      return { score: Math.abs(c), side };
    },
    plan: (p, i, entryPrice, side) => ({ stop: entryPrice - (side === "long" ? 1 : -1) * STOP_ATR * p.atr14[i] }),
  };
}
