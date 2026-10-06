// Lectura de los zips descargados por download.ts. Un símbolo puede dar más de un instrumento:
// si el ticker estuvo más de 7 días sin cotizar, el tramo nuevo se trata como otro activo
// (id "SYMBOL~2", "SYMBOL~3"...), porque Binance reutiliza tickers con otra escala de precio.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSingleFile } from "./zip.js";
import { parseKlinesCsv, parseFundingCsv, splitSegments, type Candle, type FundingEvent } from "./candles.js";
import { KLINES_DIR, FUNDING_DIR } from "./paths.js";

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
