import { describe, it, expect } from "vitest";
import { rotationStrategy, closesOnMonday, rawMomentum } from "../src/backtest/strategies/rotation.js";
import { simulate } from "../src/backtest/engine/simulate.js";
import { resample, HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import { toSeries } from "../src/backtest/data/load.js";
import type { InstrumentData, SimConfig } from "../src/backtest/engine/types.js";
import type { UniverseSnapshot } from "../src/backtest/universe.js";

// 2021-01-04 fue lunes: el origen queda alineado a un lunes 00:00 UTC.
const T0 = Date.UTC(2021, 0, 4);

describe("closesOnMonday", () => {
  it("la vela del domingo cierra el lunes 00:00 UTC", () => {
    expect(closesOnMonday(Date.UTC(2021, 0, 3))).toBe(true); // domingo
    expect(closesOnMonday(Date.UTC(2021, 0, 4))).toBe(false); // lunes
  });
});

describe("rawMomentum", () => {
  it("retorno de L días, NaN antes", () => {
    const m = rawMomentum(Float64Array.from([100, 110, 121]), 2);
    expect(Number.isNaN(m[1])).toBe(true);
    expect(m[2]).toBeCloseTo(0.21, 10);
  });
});

describe("exitSignal (histéresis y filtro)", () => {
  const s = rotationStrategy({ score: "raw", lookbackDays: 14, topK: 3 });
  const p = { score: new Float64Array(2), regimeOk: Uint8Array.from([1, 1]), isRebalance: Uint8Array.from([0, 1]), atr14: Float64Array.from([1, 1]) };
  const pos = (csRank?: number) => ({ side: "long" as const, entryPrice: 1, entryTfIndex: 0, stop: 0.5, barsHeld: 3, csRank });

  it("fuera del día de rebalanceo nunca sale por señal", () => {
    expect(s.exitSignal!(p, 0, pos(30))).toBe(false);
  });

  it("se mantiene mientras esté dentro del top 2K, sale fuera de él o si deja el ranking", () => {
    expect(s.exitSignal!(p, 1, pos(6))).toBe(false); // 2K = 6
    expect(s.exitSignal!(p, 1, pos(7))).toBe(true);
    expect(s.exitSignal!(p, 1, pos(undefined))).toBe(true);
  });

  it("sale de todo si el filtro de mercado se apaga", () => {
    const off = { ...p, regimeOk: Uint8Array.from([1, 0]) };
    expect(s.exitSignal!(off, 1, pos(1))).toBe(true);
  });
});

function instrument(id: string, dailyDrift: number, days: number): InstrumentData {
  const candles: Candle[] = [];
  let price = 100;
  for (let h = 0; h < days * 24; h++) {
    const open = price;
    price *= 1 + dailyDrift / 24;
    candles.push({ openTime: T0 + h * HOUR_MS, open, high: Math.max(open, price) * 1.001, low: Math.min(open, price) * 0.999, close: price, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 });
  }
  const daily = toSeries(resample(candles, 24));
  return { id, symbol: id, h1: toSeries(candles, false), tf: daily, daily, funding: { time: new Float64Array(0), rate: new Float64Array(0) }, minNotional: 5 };
}

describe("rotación con el motor completo", () => {
  const days = 260;
  const drifts: Record<string, number> = { A: 0.012, B: 0.009, C: 0.006, D: 0.003 };
  const insts = new Map(Object.entries(drifts).map(([id, d]) => [id, instrument(id, d, days)]));
  const btc = instrument("BTC", 0.002, days); // BTC en alza: el filtro de mercado queda prendido
  const universe: UniverseSnapshot[] = [{ date: T0, ranked: ["A", "B", "C", "D"] }];
  const cfg: SimConfig = {
    start: T0, end: T0 + days * DAY_MS, initialEquity: 300, marginPerTrade: 6, leverageMin: 1, leverageMax: 10, notionalFloor: 10,
    maintenanceMarginRate: 0.01, maxPositions: 5, feeRate: 0.0005, slippageTiers: [{ maxRank: 100, bps: 0 }], stopSlippageMult: 2, delistPenalty: 0.05, costMultiplier: 1,
  };
  const res = simulate(rotationStrategy({ score: "raw", lookbackDays: 14, topK: 2 }), insts, { btcDaily: btc.daily }, universe, cfg);

  it("entra solo los lunes, en las K más fuertes", () => {
    expect(res.trades.length).toBeGreaterThan(0);
    for (const t of res.trades) expect(new Date(t.entryTime).getUTCDay()).toBe(1);
    expect(new Set(res.trades.map((t) => t.instrument))).toEqual(new Set(["A", "B"]));
  });

  it("nunca tiene más de K posiciones abiertas", () => {
    expect(Math.max(...res.equity.map((e) => e.openPositions))).toBeLessThanOrEqual(2);
  });
});
