import { describe, it, expect } from "vitest";
import { toSeries } from "../src/backtest/data/load.js";
import { resample, HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import { simulatePairs } from "../src/backtest/strategies/pairNeutral.js";
import { DEFAULT_SIM_CONFIG, type InstrumentData, type SimConfig } from "../src/backtest/engine/types.js";

const T0 = Date.parse("2024-01-01T00:00:00Z");
const DAYS = 40;
/** Hora (desde T0) en que el ratio long/short de la moneda salta: cierre de vela de 4h. */
const JUMP_H = 35 * 24;

function hours(price: (h: number) => number): Candle[] {
  return Array.from({ length: DAYS * 24 }, (_, h) => {
    const c = price(h);
    const o = h === 0 ? c : price(h - 1);
    return { openTime: T0 + h * HOUR_MS, open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 };
  });
}

function instrument(id: string, candles: Candle[], ratio?: (h: number) => number, minNotional = 5): InstrumentData {
  const n = candles.length;
  return {
    id, symbol: id,
    h1: toSeries(candles, false), tf: toSeries(resample(candles, 4)), daily: toSeries(resample(candles, 24)),
    funding: { time: new Float64Array(0), rate: new Float64Array(0) },
    minNotional,
    metrics: ratio
      ? { time: Float64Array.from({ length: n }, (_, h) => T0 + (h + 1) * HOUR_MS), lsAccount: Float64Array.from({ length: n }, (_, h) => ratio(h + 1)), openInterest: new Float64Array(n).fill(1), topAccount: new Float64Array(n).fill(1) }
      : undefined,
  };
}

// Ratio con ruido estable y un salto fuerte desde JUMP_H (zLS >> 2 en ese cierre).
const noisyRatio = (h: number) => (h >= JUMP_H ? 3 : 1 + ((h * 7919) % 11) / 100);
const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ ...DEFAULT_SIM_CONFIG, slippageTiers: [{ maxRank: 100, bps: 0 }], start: T0 + 30 * DAY_MS, end: T0 + DAYS * DAY_MS, initialEquity: 100, ...over });
const universe = (ids: string[]) => [{ date: T0, ranked: ids }];

describe("simulatePairs (POS neutral al mercado)", () => {
  it("abre corto en la moneda + largo en ETH por el mismo nocional y cierra a las 72 h", () => {
    // La moneda cae 10 % y ETH sube 5 % después de la entrada: el par gana por los dos lados.
    const coin = instrument("COINUSDT", hours((h) => (h <= JUMP_H ? 10 : 9)), noisyRatio);
    const eth = instrument("ETHUSDT", hours((h) => (h <= JUMP_H ? 2000 : 2100)), () => 1, 20);
    const res = simulatePairs("t", { rankFrom: 1, rankTo: 10, fraction: 0.25 }, new Map([["COINUSDT", coin], ["ETHUSDT", eth]]), universe(["ETHUSDT", "COINUSDT"]), cfg());
    // El ratio sigue saturado después de las 72 h: la señal se repite y abre otro par (una a la vez).
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    const t = res.trades[0];
    expect(t.instrument).toBe("COINUSDT");
    if (res.trades[1]) expect(res.trades[1].entryTime).toBeGreaterThanOrEqual(t.exitTime);
    expect(t.entryTime).toBe(T0 + JUMP_H * HOUR_MS);
    expect(t.exitReason).toBe("time");
    expect(t.exitTime).toBe(T0 + (JUMP_H + 72) * HOUR_MS);
    // 25 % de 100 = 25 de margen, 12,5 por pata. ETH exige 20 de nocional → x2 para las dos (25 de nocional).
    expect(t.leverage).toBe(2);
    expect(t.notional).toBeCloseTo(25, 6);
    // Bruto: corto 25 × 10 % + largo 25 × 5 % (las entradas son el open de la hora del salto = precio previo).
    expect(t.grossPnl).toBeCloseTo(25 * 0.1 + 25 * 0.05, 6);
    const fees = 2 * 25 * 0.0005 + 25 * (9 / 10) * 0.0005 + 25 * (2100 / 2000) * 0.0005;
    expect(t.fees).toBeCloseTo(fees, 6);
    expect(res.equity.at(-1)!.equity).toBeCloseTo(100 + res.trades.reduce((a, x) => a + x.netPnl, 0), 6);
  });

  it("si la moneda y ETH se mueven igual, el par no gana ni pierde (salvo costos)", () => {
    const up = (h: number) => (h <= JUMP_H ? 1 : 1.2);
    const coin = instrument("COINUSDT", hours((h) => 10 * up(h)), noisyRatio);
    const eth = instrument("ETHUSDT", hours((h) => 2000 * up(h)), () => 1, 20);
    const res = simulatePairs("t", { rankFrom: 1, rankTo: 10, fraction: 0.25 }, new Map([["COINUSDT", coin], ["ETHUSDT", eth]]), universe(["ETHUSDT", "COINUSDT"]), cfg());
    expect(res.trades[0].grossPnl).toBeCloseTo(0, 6);
  });

  it("stop del par: si la moneda sube mucho más que ETH, cierra antes de las 72 h", () => {
    const coin = instrument("COINUSDT", hours((h) => (h <= JUMP_H ? 10 : h <= JUMP_H + 5 ? 10 : 13)), noisyRatio);
    const eth = instrument("ETHUSDT", hours(() => 2000), () => 1, 20);
    const res = simulatePairs("t", { rankFrom: 1, rankTo: 10, fraction: 0.25 }, new Map([["COINUSDT", coin], ["ETHUSDT", eth]]), universe(["ETHUSDT", "COINUSDT"]), cfg());
    const t = res.trades[0];
    expect(t.exitReason).toBe("stop");
    expect(t.exitTime).toBeLessThan(T0 + (JUMP_H + 72) * HOUR_MS);
    expect(t.netPnl).toBeLessThan(0);
  });

  it("solo busca señales en el rango de ranks pedido", () => {
    const coin = instrument("COINUSDT", hours(() => 10), noisyRatio);
    const eth = instrument("ETHUSDT", hours(() => 2000), () => 1, 20);
    const res = simulatePairs("t", { rankFrom: 31, rankTo: 60, fraction: 0.25 }, new Map([["COINUSDT", coin], ["ETHUSDT", eth]]), universe(["ETHUSDT", "COINUSDT"]), cfg());
    expect(res.trades).toHaveLength(0);
  });
});
