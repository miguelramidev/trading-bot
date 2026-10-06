// Arma los InstrumentData que consume el simulador: series en columnas, TF de señal y diario
// derivados de 1h, funding del tramo y MIN_NOTIONAL del par.
import { existsSync, readFileSync } from "node:fs";
import { resample, HOUR_MS, type Candle } from "./candles.js";
import { loadInstruments, loadFunding } from "./store.js";
import { MIN_NOTIONAL_PATH } from "./paths.js";
import type { InstrumentData, Series } from "../engine/types.js";

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

/**
 * Instrumentos de un símbolo. `h1From` recorta solo las velas de 1h (las que usa el simulador
 * para ejecutar, desde el inicio del período): el TF de señal y el diario conservan toda la
 * historia para calentar los indicadores. `Infinity` = sin velas de 1h (solo diario).
 */
export function loadInstrumentData(symbol: string, tfHours: number, h1From: number): InstrumentData[] {
  const funding = loadFunding(symbol);
  return loadInstruments(symbol).map((inst) => {
    const c = inst.candles1h;
    const first = c[0].openTime;
    const last = c[c.length - 1].openTime + HOUR_MS;
    const f = funding.filter((e) => e.calcTime >= first && e.calcTime <= last);
    return {
      id: inst.id,
      symbol,
      h1: toSeries(h1From === Infinity ? [] : c.filter((x) => x.openTime >= h1From), false),
      tf: toSeries(tfHours === 1 ? c : resample(c, tfHours)),
      daily: toSeries(resample(c, 24)),
      funding: {
        // calc_time llega con algunos ms de desfase: se redondea a la hora del evento.
        time: Float64Array.from(f, (e) => Math.round(e.calcTime / HOUR_MS) * HOUR_MS),
        rate: Float64Array.from(f, (e) => e.rate),
      },
      minNotional: minNotionalOf(symbol),
    };
  });
}
