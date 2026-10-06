// Arma los InstrumentData que consume el simulador: series en columnas, TF de señal y diario
// derivados de 1h, funding del tramo y MIN_NOTIONAL del par.
import { existsSync, readFileSync } from "node:fs";
import { resample, HOUR_MS, DAY_MS, type Candle } from "./candles.js";
import { loadInstruments, loadFunding, loadMetrics } from "./store.js";
import { MIN_NOTIONAL_PATH } from "./paths.js";
import type { InstrumentData, MetricsSeries, Series } from "../engine/types.js";

/** Pasa velas a columnas. Con `checkOrder` verifica que openTime sea estrictamente creciente. */
export function toSeries(candles: Candle[], checkOrder = true): Series {
  const n = candles.length;
  const s: Series = {
    openTime: new Float64Array(n),
    open: new Float64Array(n),
    high: new Float64Array(n),
    low: new Float64Array(n),
    close: new Float64Array(n),
    volume: new Float64Array(n),
    quoteVolume: new Float64Array(n),
    length: n,
  };
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (checkOrder && i > 0 && c.openTime <= candles[i - 1].openTime) throw new Error(`Velas desordenadas en ${new Date(c.openTime).toISOString()}`);
    s.openTime[i] = c.openTime;
    s.open[i] = c.open;
    s.high[i] = c.high;
    s.low[i] = c.low;
    s.close[i] = c.close;
    s.volume[i] = c.volume;
    s.quoteVolume[i] = c.quoteVolume;
  }
  return s;
}

let minNotionals: Record<string, number> | null = null;
function minNotionalOf(symbol: string): number {
  if (!minNotionals) minNotionals = existsSync(MIN_NOTIONAL_PATH) ? JSON.parse(readFileSync(MIN_NOTIONAL_PATH, "utf8")) : {};
  return minNotionals![symbol] ?? 5;
}

/** Con TF de señal de 1h, historia previa a `h1From` que se conserva para calentar los indicadores
 * (EMA 200 de 1h y correlación de 7 días). */
export const H1_SIGNAL_WARMUP_MS = 60 * DAY_MS;

/**
 * Instrumentos de un símbolo. `h1From` recorta solo las velas de 1h (las que usa el simulador
 * para ejecutar, desde el inicio del período): el TF de señal y el diario conservan toda la
 * historia para calentar los indicadores. `Infinity` = sin velas de 1h (solo diario).
 *
 * Con `tfHours` = 1 el TF de señal y el de ejecución son la misma serie (un solo objeto, para no
 * duplicar memoria), recortada a `h1From − H1_SIGNAL_WARMUP_MS`.
 */
export function loadInstrumentData(symbol: string, tfHours: number, h1From: number, opts: { metrics?: boolean } = {}): InstrumentData[] {
  const funding = loadFunding(symbol);
  const metrics = opts.metrics ? loadMetrics(symbol) : null;
  return loadInstruments(symbol).map((inst) => {
    const c = inst.candles1h;
    const first = c[0].openTime;
    const last = c[c.length - 1].openTime + HOUR_MS;
    const f = funding.filter((e) => e.calcTime >= first && e.calcTime <= last);
    const h1 = h1From === Infinity ? toSeries([], false) : toSeries(c.filter((x) => x.openTime >= (tfHours === 1 ? h1From - H1_SIGNAL_WARMUP_MS : h1From)), false);
    return {
      id: inst.id,
      symbol,
      h1,
      tf: tfHours === 1 ? h1 : toSeries(resample(c, tfHours)),
      daily: toSeries(resample(c, 24)),
      funding: {
        // calc_time llega con algunos ms de desfase: se redondea a la hora del evento.
        time: Float64Array.from(f, (e) => Math.round(e.calcTime / HOUR_MS) * HOUR_MS),
        rate: Float64Array.from(f, (e) => e.rate),
      },
      minNotional: minNotionalOf(symbol),
      listedAt: first,
      metrics: metrics ? sliceMetrics(metrics, first, last) : undefined,
    };
  });
}

/** Métricas dentro de [from, to] (el tramo de un instrumento, por si el ticker se relistó). */
function sliceMetrics(m: MetricsSeries, from: number, to: number): MetricsSeries {
  let a = 0;
  while (a < m.time.length && m.time[a] < from) a++;
  let b = a;
  while (b < m.time.length && m.time[b] <= to) b++;
  return { time: m.time.slice(a, b), lsAccount: m.lsAccount.slice(a, b), openInterest: m.openInterest.slice(a, b) };
}
