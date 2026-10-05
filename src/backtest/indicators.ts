// Indicadores puros para el backtest y para la estrategia nueva de producción (mismo código en
// los dos lados: lo que se valida es lo que se ejecuta). A diferencia de los de
// src/bot/data.ts, que rellenan el calentamiento con 0 (y hacen que, por ejemplo, `precio > EMA`
// dé verdadero en las primeras velas), acá el calentamiento es NaN: cualquier comparación con
// NaN da falso, así que una señal nunca se dispara con un indicador sin datos suficientes.
// Todos devuelven un array alineado con la entrada (mismo largo, mismo índice).

export function sma(values: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA sembrada con la SMA de las primeras `period` velas (igual que calculateEMA de data.ts). */
export function ema(values: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

/** ATR de Wilder (mismo cálculo que calculateATR de data.ts, con NaN en el calentamiento). */
export function atr(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, period: number): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (n < period) return out;
  const tr = new Float64Array(n);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder. Primer valor válido en el índice `period`. */
export function rsi(close: ArrayLike<number>, period: number): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (n <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = close[i] - close[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < n; i++) {
    const d = close[i] - close[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

/** Máximo de las `period` velas que TERMINAN en i (incluida i). */
export function rollingMax(values: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  const deque: number[] = []; // índices con valores decrecientes
  for (let i = 0; i < values.length; i++) {
    while (deque.length && values[deque[deque.length - 1]] <= values[i]) deque.pop();
    deque.push(i);
    if (deque[0] <= i - period) deque.shift();
    if (i >= period - 1) out[i] = values[deque[0]];
  }
  return out;
}

/** Mínimo de las `period` velas que TERMINAN en i (incluida i). */
export function rollingMin(values: ArrayLike<number>, period: number): Float64Array {
  const neg = Array.from(values, (v) => -v);
  return rollingMax(neg, period).map((v) => -v);
}

/** Valor del array desplazado `k` velas hacia atrás (out[i] = values[i-k]); NaN al principio. */
export function shift(values: ArrayLike<number>, k: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  for (let i = k; i < values.length; i++) out[i] = values[i - k];
  return out;
}
