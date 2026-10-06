// Cliente de los endpoints PÚBLICOS de Binance que usa el modo sombra (sin claves, sin órdenes).
// `fetch` es inyectable para los tests (tests/setup.ts bloquea el fetch global).
import type { Candle } from "../backtest/data/candles.js";

const FAPI = "https://fapi.binance.com";
const SPOT = "https://api.binance.com";

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export class BinancePublic {
  constructor(private readonly fetchFn: FetchFn = (url) => fetch(url)) {}

  private async get(url: string): Promise<any> {
    for (let k = 1; ; k++) {
      const res = await this.fetchFn(url);
      if (res.ok) return res.json();
      if (k >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`Binance ${res.status}: ${url.replace(/\?.*/, "")}`);
      await new Promise((r) => setTimeout(r, 1000 * k));
    }
  }

  /** Perpetuos USDT en trading: símbolo y underlyingType (para descartar acciones, commodities, etc.). */
  async perpetuals(): Promise<{ symbol: string; underlyingType: string }[]> {
    const info = await this.get(`${FAPI}/fapi/v1/exchangeInfo`);
    return info.symbols
      .filter((s: any) => s.contractType === "PERPETUAL" && s.status === "TRADING" && s.quoteAsset === "USDT")
      .map((s: any) => ({ symbol: s.symbol, underlyingType: s.underlyingType }));
  }

  async quoteVolumes24h(): Promise<Map<string, number>> {
    const rows = await this.get(`${FAPI}/fapi/v1/ticker/24hr`);
    return new Map(rows.map((r: any) => [r.symbol, Number(r.quoteVolume)]));
  }

  /** Velas del perpetuo (incluye la que está en curso como última). */
  async klines(symbol: string, interval: "1h" | "4h" | "1d", opts: { limit?: number; startTime?: number } = {}): Promise<Candle[]> {
    const q = new URLSearchParams({ symbol, interval, limit: String(opts.limit ?? 500) });
    if (opts.startTime !== undefined) q.set("startTime", String(opts.startTime));
    const rows: any[][] = await this.get(`${FAPI}/fapi/v1/klines?${q}`);
    return rows.map((r) => ({
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      quoteVolume: Number(r[7]),
      trades: Number(r[8]),
      takerBuyVolume: Number(r[9]),
    }));
  }

  /** Ratio long/short de cuentas (el mismo dato que count_long_short_ratio de los archivos). Solo 30 días. */
  async longShortAccountRatio(symbol: string, limit = 180): Promise<{ time: number; ratio: number }[]> {
    const rows = await this.get(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=4h&limit=${limit}`);
    return rows.map((r: any) => ({ time: Number(r.timestamp), ratio: Number(r.longShortRatio) }));
  }

  async fundingRates(symbol: string, startTime: number): Promise<{ time: number; rate: number }[]> {
    const rows = await this.get(`${FAPI}/fapi/v1/fundingRate?symbol=${symbol}&startTime=${startTime}&limit=1000`);
    return rows.map((r: any) => ({ time: Number(r.fundingTime), rate: Number(r.fundingRate) }));
  }

  async perpPrice(symbol: string): Promise<number> {
    return Number((await this.get(`${FAPI}/fapi/v1/ticker/price?symbol=${symbol}`)).price);
  }

  /** Precios spot de todos los pares USDT. */
  async spotPrices(): Promise<Map<string, number>> {
    const rows = await this.get(`${SPOT}/api/v3/ticker/price`);
    return new Map(rows.map((r: any) => [r.symbol, Number(r.price)]));
  }
}
