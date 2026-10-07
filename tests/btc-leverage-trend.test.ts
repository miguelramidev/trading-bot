import { describe, it, expect } from "vitest";
import { simulateLevTrend, type LevConfig } from "../src/backtest/analysis/btcLeverageTrend.js";
import { HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";

const T0 = Date.parse("2020-01-01T00:00:00Z");
/** Velas de 1h con el precio por día dado; mínimo de cada vela = `low(d)` si se pasa. */
function hours(days: number, price: (d: number) => number, low?: (d: number) => number): Candle[] {
  const out: Candle[] = [];
  for (let d = 0; d < days; d++) for (let h = 0; h < 24; h++) {
    const p = price(d);
    out.push({ openTime: T0 + d * DAY_MS + h * HOUR_MS, open: p, high: p, low: low ? low(d) : p, close: p, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 });
  }
  return out;
}
const cfg = (leverage: number, over: Partial<LevConfig> = {}): LevConfig => ({ leverage, deposit: 0, initial: 100, feeRate: 0, slippage: 0, mmr: 0.005, smaDays: 5, ...over });

describe("simulateLevTrend", () => {
  it("con tendencia alcista, x2 gana el doble del movimiento (sin costos ni funding)", () => {
    // 5 días a 100 (SMA), sube a 110 desde el día 6 y queda ahí.
    const h1 = hours(20, (d) => (d < 6 ? 100 + d * 0.01 : 110));
    const r = simulateLevTrend(h1, [], cfg(2), T0 + 6 * DAY_MS, T0 + 20 * DAY_MS);
    // Entra el día 6 al open (110, ya sobre la SMA) y el precio no se mueve más: queda en 100.
    expect(r.finalEquity).toBeCloseTo(100, 6);
    const h2 = hours(20, (d) => (d < 6 ? 100 + d * 0.01 : d < 8 ? 110 : 121));
    const r2 = simulateLevTrend(h2, [], cfg(2), T0 + 6 * DAY_MS, T0 + 20 * DAY_MS);
    expect(r2.finalEquity).toBeCloseTo(100 + 2 * 100 * (121 / 110 - 1), 6);
  });

  it("a x20, una caída intradía del 5 % liquida y se pierde todo el saldo", () => {
    const h1 = hours(20, (d) => (d < 6 ? 100 + d * 0.01 : 110), (d) => (d === 9 ? 104 : d < 6 ? 100 + d * 0.01 : 110));
    const r = simulateLevTrend(h1, [], cfg(20), T0 + 6 * DAY_MS, T0 + 20 * DAY_MS);
    expect(r.liquidations).toBe(1);
    expect(r.finalEquity).toBe(0);
  });

  it("el largo paga funding positivo sobre el nocional (no sobre el saldo)", () => {
    const h1 = hours(20, (d) => (d < 6 ? 100 + d * 0.01 : 110));
    const funding = [{ time: T0 + 10 * DAY_MS, rate: 0.001 }];
    const r = simulateLevTrend(h1, funding, cfg(5), T0 + 6 * DAY_MS, T0 + 20 * DAY_MS);
    expect(r.fundingPaid).toBeCloseTo(500 * 0.001, 6); // nocional 5 × 100
    expect(r.finalEquity).toBeCloseTo(100 - 0.5, 6);
  });

  it("debajo de la SMA se queda afuera, y el aporte mensual se suma al saldo", () => {
    const h1 = hours(70, () => 100); // nunca sobre la SMA (igual, no mayor)
    const r = simulateLevTrend(h1, [], cfg(5, { deposit: 30 }), T0 + 6 * DAY_MS, T0 + 70 * DAY_MS);
    expect(r.trades).toBe(0);
    expect(r.deposited).toBe(100 + 2 * 30); // 1/feb y 1/mar
    expect(r.finalEquity).toBeCloseTo(160, 6);
  });
});
