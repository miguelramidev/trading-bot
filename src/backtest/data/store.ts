// Lectura de los zips descargados por download.ts. Un símbolo puede dar más de un instrumento:
// si el ticker estuvo más de 7 días sin cotizar, el tramo nuevo se trata como otro activo
// (id "SYMBOL~2", "SYMBOL~3"...), porque Binance reutiliza tickers con otra escala de precio.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSingleFile } from "./zip.js";
import { parseKlinesCsv, parseFundingCsv, splitSegments, HOUR_MS, type Candle, type FundingEvent } from "./candles.js";
import { KLINES_DIR, FUNDING_DIR, METRICS_DIR } from "./paths.js";
import type { MetricsSeries } from "../engine/types.js";

export interface RawInstrument {
  id: string;
  symbol: string;
  candles1h: Candle[];
}

export function listDownloadedSymbols(): string[] {
  if (!existsSync(KLINES_DIR)) throw new Error("No hay datos: correr antes npx tsx src/backtest/data/download.ts");
  return readdirSync(KLINES_DIR).sort();
}

function readZips(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .sort()
    .map((f) => extractSingleFile(readFileSync(join(dir, f))).toString("utf8"));
}

export function loadInstruments(symbol: string): RawInstrument[] {
  const all = parseKlinesCsv(readZips(join(KLINES_DIR, symbol)).join("\n"));
  const segments = splitSegments(all);
  return segments.map((candles1h, k) => ({ id: segments.length === 1 || k === 0 ? symbol : `${symbol}~${k + 1}`, symbol, candles1h }));
}

export function loadFunding(symbol: string): FundingEvent[] {
  return parseFundingCsv(readZips(join(FUNDING_DIR, symbol)).join("\n"));
}

/** "2024-03-01 00:05:00" (UTC) → ms. */
function parseUtc(s: string): number {
  return Date.parse(`${s.replace(" ", "T")}Z`);
}

/**
 * Métricas de 5m (create_time, symbol, sum_open_interest, sum_open_interest_value,
 * count_toptrader_long_short_ratio, sum_toptrader_long_short_ratio, count_long_short_ratio,
 * sum_taker_long_short_vol_ratio) llevadas a 1h: para cada hora H, la última fila con
 * create_time ≤ H. Filas con valores vacíos o no positivos se descartan.
 */
export function loadMetrics(symbol: string): MetricsSeries {
  const byHour = new Map<number, { t: number; ls: number; oi: number }>();
  for (const text of readZips(join(METRICS_DIR, symbol))) {
    for (const line of text.split(/\r?\n/)) {
      if (!/^\d{4}-/.test(line)) continue;
      const c = line.split(",");
      const t = parseUtc(c[0]);
      const oi = Number(c[2]);
      const ls = Number(c[6]);
      if (!Number.isFinite(t) || !(oi > 0) || !(ls > 0)) continue;
      const hour = Math.ceil(t / HOUR_MS) * HOUR_MS;
      const prev = byHour.get(hour);
      if (!prev || t > prev.t) byHour.set(hour, { t, ls, oi });
    }
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  return {
    time: Float64Array.from(hours),
    lsAccount: Float64Array.from(hours, (h) => byHour.get(h)!.ls),
    openInterest: Float64Array.from(hours, (h) => byHour.get(h)!.oi),
  };
}
