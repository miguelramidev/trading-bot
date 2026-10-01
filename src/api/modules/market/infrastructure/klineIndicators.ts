import { DataFetcher } from "../../../../bot/data.js";

// Mismas funciones que usa `analyze.ts` para decidir señales (importadas,
// no reimplementadas) — si `analyze.ts` cambia un cálculo, este endpoint
// cambia con él en vez de poder desincronizarse.
const dataFetcher = new DataFetcher();

export type IndicatorKey = "ema200" | "ema50" | "ema20" | "macd" | "adx";

const ALL_INDICATOR_KEYS: readonly IndicatorKey[] = ["ema200", "ema50", "ema20", "macd", "adx"];

/** `"ema200,macd,adx"` -> `["ema200", "macd", "adx"]`. Ignora claves desconocidas. */
export function parseIndicatorKeys(raw: string | undefined | null): IndicatorKey[] {
  if (!raw) return [];
  const requested = raw.split(",").map((s) => s.trim());
  return ALL_INDICATOR_KEYS.filter((key) => requested.includes(key));
}

/**
 * Velas de calentamiento que se piden de más (y no se muestran) para que el
 * indicador más lento que soporta este endpoint (EMA200) ya esté calculado
 * desde la primera vela visible — la misma cantidad que `analyze.ts` trae
 * para el ciclo de 15m (`fetchOhlcv(symbol, "15m", 250)`, línea 221).
 */
export const INDICATOR_WARMUP_CANDLES = 200;

export type RawKline = Array<string | number>;

export interface ComputedIndicators {
  ema200?: number[] | null;
  ema50?: number[] | null;
  ema20?: number[] | null;
  macd?: { macdLine: number[]; signalLine: number[]; histogram: number[] } | null;
  adx?: { adx: number[]; plusDI: number[]; minusDI: number[] } | null;
}

/**
 * Calcula los indicadores pedidos sobre TODO el array de velas recibido
 * (que ya debería incluir el calentamiento) y recorta cada serie a las
 * últimas `visibleCount` entradas, alineadas 1:1 con las velas que se van
 * a mostrar.
 *
 * `DataFetcher.calculateEMA`/`calculateMACD`/`calculateADX` devuelven un
 * array vacío (no lanzan ni devuelven `null`) cuando no hay suficiente
 * historia para ese período — ocurre con símbolos recién listados en
 * Binance, con menos velas de 15m que el período del indicador (hasta
 * 200 para EMA200). Acá se traduce ese "vacío" a `null` explícito por
 * clave: el array vacío nunca sale de esta función, porque Flutter lo
 * distinguía de "no pedido" igual que de un indicador presente (un
 * array vacío no es `null`) y terminaba sin dibujar nada, en silencio.
 */
export function computeKlineIndicators(klines: RawKline[], keys: IndicatorKey[], visibleCount: number): ComputedIndicators {
  if (keys.length === 0) return {};

  const candles = klines.map((k) => ({
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
  }));
  const closes = candles.map((c) => c.close);

  const trim = <T>(arr: T[]): T[] => arr.slice(Math.max(0, arr.length - visibleCount));

  const result: ComputedIndicators = {};
  if (keys.includes("ema200")) {
    const ema200 = dataFetcher.calculateEMA(closes, 200);
    result.ema200 = ema200.length > 0 ? trim(ema200) : null;
  }
  if (keys.includes("ema50")) {
    const ema50 = dataFetcher.calculateEMA(closes, 50);
    result.ema50 = ema50.length > 0 ? trim(ema50) : null;
  }
  if (keys.includes("ema20")) {
    const ema20 = dataFetcher.calculateEMA(closes, 20);
    result.ema20 = ema20.length > 0 ? trim(ema20) : null;
  }
  if (keys.includes("macd")) {
    const macd = dataFetcher.calculateMACD(closes, 12, 26, 9);
    result.macd = macd.macdLine.length > 0 ? { macdLine: trim(macd.macdLine), signalLine: trim(macd.signalLine), histogram: trim(macd.histogram) } : null;
  }
  if (keys.includes("adx")) {
    const adx = dataFetcher.calculateADX(candles, 14);
    result.adx = adx.adx.length > 0 ? { adx: trim(adx.adx), plusDI: trim(adx.plusDI), minusDI: trim(adx.minusDI) } : null;
  }
  return result;
}

/**
 * Descarta la última vela del array recibido de Binance: igual que
 * `analyze.ts` (línea 228, `candles15m.pop()`), es la vela en curso,
 * todavía incompleta — nunca debe entrar en el cálculo de un indicador.
 */
export function dropIncompleteCandle<T>(klines: T[]): T[] {
  return klines.slice(0, Math.max(0, klines.length - 1));
}
