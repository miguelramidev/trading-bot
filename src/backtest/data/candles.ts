// Velas y funding de data.binance.vision: parseo de los CSV, agregación de 1h a TF superiores y
// corte de series con huecos largos (tickers relistados).

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  takerBuyVolume: number;
}

export interface FundingEvent {
  calcTime: number;
  intervalHours: number;
  rate: number;
}

/** Desde 2025 algunos archivos traen timestamps en microsegundos: se pasan a milisegundos. */
function toMs(t: number): number {
  return t > 1e14 ? Math.floor(t / 1000) : t;
}

/** Filas de una línea CSV, o null si es encabezado/vacía. */
function rows(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(",");
    if (!/^\d/.test(cols[0])) continue; // encabezado (los archivos nuevos lo traen, los viejos no)
    out.push(cols);
  }
  return out;
}

/** Klines de Binance (12 columnas). Devuelve velas ordenadas por openTime y sin duplicados. */
export function parseKlinesCsv(text: string): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of rows(text)) {
    const openTime = toMs(Number(c[0]));
    byTime.set(openTime, {
      openTime,
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
      quoteVolume: Number(c[7]),
      trades: Number(c[8]),
      takerBuyVolume: Number(c[9]),
    });
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
}

/** fundingRate de Binance: calc_time, funding_interval_hours, last_funding_rate. */
export function parseFundingCsv(text: string): FundingEvent[] {
  return rows(text)
    .map((c) => ({ calcTime: toMs(Number(c[0])), intervalHours: Number(c[1]), rate: Number(c[2]) }))
    .sort((a, b) => a.calcTime - b.calcTime);
}

/**
 * Agrega velas de 1h en bloques de `hours` alineados a 00:00 UTC. Un bloque con menos de la
 * mitad de sus velas (hueco de datos) se descarta en vez de inventar un OHLC parcial.
 */
export function resample(candles: Candle[], hours: number): Candle[] {
  const blockMs = hours * HOUR_MS;
  const out: Candle[] = [];
  let i = 0;
  while (i < candles.length) {
    const start = Math.floor(candles[i].openTime / blockMs) * blockMs;
    const end = start + blockMs;
    let j = i;
    const bar: Candle = { ...candles[i], openTime: start, volume: 0, quoteVolume: 0, trades: 0, takerBuyVolume: 0 };
    while (j < candles.length && candles[j].openTime < end) {
      const c = candles[j];
      bar.high = Math.max(bar.high, c.high);
      bar.low = Math.min(bar.low, c.low);
      bar.close = c.close;
      bar.volume += c.volume;
      bar.quoteVolume += c.quoteVolume;
      bar.trades += c.trades;
      bar.takerBuyVolume += c.takerBuyVolume;
      j++;
    }
    if (j - i >= hours / 2) out.push(bar);
    i = j;
  }
  return out;
}

/** Hueco a partir del cual se asume que el ticker se deslistó y volvió a listar (otro activo). */
export const RELIST_GAP_MS = 7 * DAY_MS;

/** Corta la serie en tramos ante huecos de más de 7 días. */
export function splitSegments(candles: Candle[]): Candle[][] {
  const out: Candle[][] = [];
  let current: Candle[] = [];
  for (const c of candles) {
    if (current.length && c.openTime - current[current.length - 1].openTime > RELIST_GAP_MS) {
      out.push(current);
      current = [];
    }
    current.push(c);
  }
  if (current.length) out.push(current);
  return out;
}
