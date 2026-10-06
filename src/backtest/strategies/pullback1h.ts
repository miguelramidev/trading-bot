// Estrategia nueva de 1h (pre-registrada en docs/investigacion/2026-10-06-estrategia-1h.md):
// retroceso en tendencia, largos y cortos, con los filtros del bot actual que el usuario quiere
// conservar (macro de BTC, correlación con BTC, funding extremo).
//
// Tesis: a escala de 1h el precio tiende a revertir y a escala de días sigue la tendencia. Entrar
// al final de un retroceso de 1h a favor de la tendencia de 4h compra la reversión de corto plazo
// sin pelearse con la tendencia.
//
//   Tendencia de la moneda (4h, última vela cerrada): cierre > EMA50 y EMA50 subiendo respecto de
//     6 velas atrás (1 día) → alcista; espejo → bajista.
//   Gatillo (1h, vela que acaba de cerrar):
//     rsi2:  RSI(2) < 10 en tendencia alcista (largo) / > 90 en bajista (corto).
//     ema21: el mínimo toca la EMA21 y el cierre queda por encima (largo) / espejo (corto).
//   Filtro macro de BTC (como analyze.ts): BTC diario ALCISTA si cierre > EMA200 y EMA20 > EMA50,
//     BAJISTA si cierre < EMA200 y EMA20 < EMA50. Si la moneda tiene correlación positiva con
//     BTC, no se opera en contra del macro (largo vetado con BTC BAJISTA, corto con ALCISTA). Con
//     correlación negativa la moneda se evalúa sola. Sin macro definido, no veta nada.
//   Correlación: Pearson de los retornos de 1h de la moneda y de BTC en los últimos 7 días (en
//     producción hoy se calcula sobre precios, ROADMAP §18).
//   Funding: largo vetado si el último funding < −0,05 %; corto vetado si > +0,05 % (analyze.ts).
//   Exposición: si la moneda tiene correlación > 20 % con BTC, no se abre si ya hay otra posición
//     del mismo lado también correlacionada > 20 % (o BTC mismo).
//   Salida: bracket fijo (SL 1,5 ATR / TP 3 ATR de 1h) o trailing del bot por ATR (stop inicial
//     1,5 ATR, chandelier de 3 ATR sobre el extremo de 22 cierres, se mueve al cierre de cada 1h).
import type { Side } from "../engine/exits.js";
import type { InstrumentData, MarketData, Series, Strategy } from "../engine/types.js";
import { HOUR_MS } from "../data/candles.js";
import { ema, rsi } from "../indicators.js";
import { alignDaily, buildPlan, botTrailStop, exitArrays, exitLabel, type ExitArrays, type ExitParams } from "./common.js";

export const FUNDING_EXTREME = 0.0005;
export const EXPOSURE_CORR = 0.2;
export const CORR_WINDOW_H = 168;
/** Pares válidos mínimos dentro de la ventana para que la correlación cuente. */
export const CORR_MIN_PAIRS = 120;
const RSI2_LOW = 10;
const RSI2_HIGH = 90;
const TREND_SLOPE_BARS_4H = 6;

export interface Pullback1hFilters {
  macro: boolean;
  funding: boolean;
  exposure: boolean;
}

export interface Pullback1hParams {
  trigger: "rsi2" | "ema21";
  exit: ExitParams;
  filters: Pullback1hFilters;
}

export interface Pullback1hPrepared {
  isBtc: boolean;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  rsi2: Float64Array;
  ema21: Float64Array;
  /** +1 alcista, −1 bajista, 0 sin tendencia (4h). */
  trend: Int8Array;
  /** +1 ALCISTA, −1 BAJISTA, 0 sin definir (BTC diario). */
  macro: Int8Array;
  corr: Float64Array;
  funding: Float64Array;
  exitLong: ExitArrays;
  exitShort: ExitArrays;
}

/**
 * Para cada vela i de `tf` (TF de `tfHours`), índice de la última vela de `higher` (TF de
 * `higherHours`) ya CERRADA al cierre de i. −1 si no hay ninguna.
 */
export function alignHigher(tf: Series, tfHours: number, higher: Series, higherHours: number): Int32Array {
  const out = new Int32Array(tf.length).fill(-1);
  let k = -1;
  for (let i = 0; i < tf.length; i++) {
    const closeTime = tf.openTime[i] + tfHours * HOUR_MS;
    while (k + 1 < higher.length && higher.openTime[k + 1] + higherHours * HOUR_MS <= closeTime) k++;
    out[i] = k;
  }
  return out;
}

/** Agrega una serie de 1h en bloques de `hours` alineados a 00:00 UTC (como resample de candles.ts). */
export function resampleSeries(s: Series, hours: number): Series {
  const block = hours * HOUR_MS;
  const cols = { openTime: [] as number[], open: [] as number[], high: [] as number[], low: [] as number[], close: [] as number[], volume: [] as number[], quoteVolume: [] as number[] };
  let i = 0;
  while (i < s.length) {
    const start = Math.floor(s.openTime[i] / block) * block;
    let j = i;
    let hi = -Infinity;
    let lo = Infinity;
    let vol = 0;
    let qv = 0;
    while (j < s.length && s.openTime[j] < start + block) {
      hi = Math.max(hi, s.high[j]);
      lo = Math.min(lo, s.low[j]);
      vol += s.volume[j];
      qv += s.quoteVolume[j];
      j++;
    }
    if (j - i >= hours / 2) {
      cols.openTime.push(start);
      cols.open.push(s.open[i]);
      cols.high.push(hi);
      cols.low.push(lo);
      cols.close.push(s.close[j - 1]);
      cols.volume.push(vol);
      cols.quoteVolume.push(qv);
    }
    i = j;
  }
  return {
    openTime: Float64Array.from(cols.openTime),
    open: Float64Array.from(cols.open),
    high: Float64Array.from(cols.high),
    low: Float64Array.from(cols.low),
    close: Float64Array.from(cols.close),
    volume: Float64Array.from(cols.volume),
    quoteVolume: Float64Array.from(cols.quoteVolume),
    length: cols.openTime.length,
  };
}

/** Retorno logarítmico de 1h en i, o NaN si la vela anterior no es la hora previa (hueco). */
function hourlyReturns(s: Series): Float64Array {
  const out = new Float64Array(s.length).fill(NaN);
  for (let i = 1; i < s.length; i++) {
    if (s.openTime[i] - s.openTime[i - 1] === HOUR_MS && s.close[i - 1] > 0) out[i] = Math.log(s.close[i] / s.close[i - 1]);
  }
  return out;
}

/**
 * Correlación de Pearson de los retornos de 1h de `coin` y `btc` en las últimas `window` velas
 * de `coin` que terminan en i (alineadas por openTime). NaN si hay menos de `minPairs` pares.
 */
export function returnsCorrelation(coin: Series, btc: Series, window = CORR_WINDOW_H, minPairs = CORR_MIN_PAIRS): Float64Array {
  const rc = hourlyReturns(coin);
  const rbAll = hourlyReturns(btc);
  // Retorno de BTC en la misma hora que cada vela de la moneda.
  const rb = new Float64Array(coin.length).fill(NaN);
  let j = 0;
  for (let i = 0; i < coin.length; i++) {
    while (j < btc.length && btc.openTime[j] < coin.openTime[i]) j++;
    if (j < btc.length && btc.openTime[j] === coin.openTime[i]) rb[i] = rbAll[j];
  }
  const out = new Float64Array(coin.length).fill(NaN);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const add = (k: number, sign: 1 | -1) => {
    const x = rc[k];
    const y = rb[k];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    n += sign;
    sx += sign * x;
    sy += sign * y;
    sxx += sign * x * x;
    syy += sign * y * y;
    sxy += sign * x * y;
  };
  for (let i = 0; i < coin.length; i++) {
    add(i, 1);
    if (i >= window) add(i - window, -1);
    if (n >= minPairs) {
      const cov = sxy - (sx * sy) / n;
      const vx = sxx - (sx * sx) / n;
      const vy = syy - (sy * sy) / n;
      if (vx > 0 && vy > 0) out[i] = cov / Math.sqrt(vx * vy);
    }
  }
  return out;
}

/** Estado macro de BTC (definición de analyze.ts) en la última vela diaria cerrada al cierre de cada vela de `tf`. */
export function btcMacro(tf: Series, tfHours: number, btcDaily: Series): Int8Array {
  const idx = alignDaily(tf, tfHours, btcDaily);
  const e20 = ema(btcDaily.close, 20);
  const e50 = ema(btcDaily.close, 50);
  const e200 = ema(btcDaily.close, 200);
  const out = new Int8Array(tf.length);
  for (let i = 0; i < tf.length; i++) {
    const k = idx[i];
    if (k < 0) continue;
    const c = btcDaily.close[k];
    if (c > e200[k] && e20[k] > e50[k]) out[i] = 1;
    else if (c < e200[k] && e20[k] < e50[k]) out[i] = -1;
  }
  return out;
}

/** Último funding liquidado (tiempo ≤ cierre de la vela i). NaN si todavía no hubo ninguno. */
export function lastFunding(tf: Series, tfHours: number, funding: InstrumentData["funding"]): Float64Array {
  const out = new Float64Array(tf.length).fill(NaN);
  let k = -1;
  for (let i = 0; i < tf.length; i++) {
    const closeTime = tf.openTime[i] + tfHours * HOUR_MS;
    while (k + 1 < funding.time.length && funding.time[k + 1] <= closeTime) k++;
    if (k >= 0) out[i] = funding.rate[k];
  }
  return out;
}

/** Tendencia de 4h alineada a cada vela de 1h: +1 / −1 / 0. */
export function trend4h(tf: Series): Int8Array {
  const h4 = resampleSeries(tf, 4);
  const e50 = ema(h4.close, 50);
  const idx = alignHigher(tf, 1, h4, 4);
  const out = new Int8Array(tf.length);
  for (let i = 0; i < tf.length; i++) {
    const k = idx[i];
    if (k < TREND_SLOPE_BARS_4H) continue;
    const slope = e50[k] - e50[k - TREND_SLOPE_BARS_4H];
    if (h4.close[k] > e50[k] && slope > 0) out[i] = 1;
    else if (h4.close[k] < e50[k] && slope < 0) out[i] = -1;
  }
  return out;
}

function filtersLabel(f: Pullback1hFilters): string {
  const on = [f.macro && "macro", f.funding && "fund", f.exposure && "expo"].filter(Boolean);
  return on.length === 3 ? "filtros" : on.length === 0 ? "sinfiltros" : on.join("+");
}

/** Correlación con BTC que usan el filtro macro y el de exposición (BTC consigo mismo = 1). */
function corrAt(p: Pullback1hPrepared, i: number): number {
  return p.isBtc ? 1 : p.corr[i];
}

export function pullback1hStrategy(params: Pullback1hParams): Strategy<Pullback1hPrepared> {
  const { trigger, exit, filters } = params;
  const id = ["PB1h", trigger, exitLabel(exit), filtersLabel(filters)].join("_");

  const sideAllowed = (p: Pullback1hPrepared, i: number, side: Side): boolean => {
    const s = side === "long" ? 1 : -1;
    if (filters.macro) {
      const c = corrAt(p, i);
      // Sin correlación medible se trata como positiva: obedece a BTC (lo conservador).
      const followsBtc = !(c < 0);
      if (followsBtc && p.macro[i] === -s) return false;
    }
    if (filters.funding) {
      const f = p.funding[i];
      if (side === "long" && f < -FUNDING_EXTREME) return false;
      if (side === "short" && f > FUNDING_EXTREME) return false;
    }
    return true;
  };

  return {
    id,
    family: "reversion",
    timeframeHours: 1,
    side: "both",
    prepare(inst: InstrumentData, market: MarketData): Pullback1hPrepared {
      if (!market.btcH1) throw new Error("pullback1h necesita market.btcH1 (cargar con TF de 1h)");
      const tf = inst.tf;
      return {
        isBtc: inst.symbol === "BTCUSDT",
        high: tf.high,
        low: tf.low,
        close: tf.close,
        rsi2: rsi(tf.close, 2),
        ema21: ema(tf.close, 21),
        trend: trend4h(tf),
        macro: btcMacro(tf, 1, market.btcDaily),
        corr: returnsCorrelation(tf, market.btcH1),
        funding: lastFunding(tf, 1, inst.funding),
        exitLong: exitArrays(tf, "long"),
        exitShort: exitArrays(tf, "short"),
      };
    },
    entry(p, i) {
      const t = p.trend[i];
      if (t === 0 || !(p.exitLong.atr[i] > 0)) return null;
      const side: Side = t === 1 ? "long" : "short";
      let triggered: boolean;
      if (trigger === "rsi2") {
        triggered = side === "long" ? p.rsi2[i] < RSI2_LOW : p.rsi2[i] > RSI2_HIGH;
      } else {
        const e = p.ema21[i];
        triggered = side === "long" ? p.low[i] <= e && p.close[i] > e : p.high[i] >= e && p.close[i] < e;
      }
      if (!triggered || !sideAllowed(p, i, side)) return null;
      // Sin prioridad propia: con más señales que cupos gana la más líquida (rank de volumen).
      return { score: 0, side };
    },
    plan: (p, i, entryPrice, side) => buildPlan(side, exit, side === "long" ? p.exitLong : p.exitShort, i, entryPrice),
    updateStop: (p, i, pos) => botTrailStop(pos.side, exit, pos.side === "long" ? p.exitLong : p.exitShort, i),
    allowEntry: filters.exposure
      ? (c, open) => {
          const p = c.prepared as Pullback1hPrepared;
          if (!(corrAt(p, c.i) > EXPOSURE_CORR)) return true;
          return !open.some((o) => {
            if (o.side !== c.side) return false;
            const q = o.prepared as Pullback1hPrepared;
            return corrAt(q, o.entryTfIndex) > EXPOSURE_CORR;
          });
        }
      : undefined,
  };
}
