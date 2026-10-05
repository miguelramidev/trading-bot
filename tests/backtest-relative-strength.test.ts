import { describe, it, expect } from "vitest";
import { residualMomentum } from "../src/backtest/strategies/relativeStrength.js";
import { toSeries } from "../src/backtest/data/load.js";
import { DAY_MS, type Candle } from "../src/backtest/data/candles.js";

function dailyFrom(returns: number[], start = 100): Candle[] {
  let p = start;
  return returns.map((r, k) => {
    if (k > 0) p *= 1 + r;
    return { openTime: k * DAY_MS, open: p, high: p, low: p, close: p, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 };
  });
}

// BTC con retornos que alternan, para que tenga varianza.
const btcRets = Array.from({ length: 120 }, (_, k) => (k % 2 ? 0.02 : -0.015) + (k % 7) * 0.001);

describe("residualMomentum", () => {
  it("una moneda que replica a BTC con beta 2 tiene residual ~0", () => {
    const btc = toSeries(dailyFrom(btcRets));
    const coin = toSeries(dailyFrom(btcRets.map((r) => 2 * r)));
    const rs = residualMomentum(coin, btc, 14, 60);
    expect(rs[110]).toBeCloseTo(0, 10);
  });

  it("un drift propio por encima de lo que explica BTC da residual positivo", () => {
    const btc = toSeries(dailyFrom(btcRets));
    const coin = toSeries(dailyFrom(btcRets.map((r, k) => r + (k >= 100 ? 0.01 : 0))));
    const rs = residualMomentum(coin, btc, 14, 60);
    expect(rs[115]).toBeGreaterThan(0.05);
  });

  it("NaN mientras no hay datos suficientes para la beta (sin look-ahead)", () => {
    const btc = toSeries(dailyFrom(btcRets));
    const rs = residualMomentum(toSeries(dailyFrom(btcRets)), btc, 14, 60);
    expect(Number.isNaN(rs[59])).toBe(true);
  });
});
