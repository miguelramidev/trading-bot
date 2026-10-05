import { describe, it, expect } from "vitest";
import { sma, ema, atr, rsi, rollingMax, rollingMin, shift } from "../src/backtest/indicators.js";
import { DataFetcher } from "../src/bot/data.js";

// Serie determinística con tendencia y ruido, para comparar contra los indicadores de producción.
const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.3 + Math.sin(i / 3) * 4);
const highs = closes.map((c, i) => c + 1 + (i % 5) * 0.2);
const lows = closes.map((c, i) => c - 1 - (i % 7) * 0.15);
const candles = closes.map((c, i) => ({ high: highs[i], low: lows[i], close: c }));

describe("indicadores: calentamiento en NaN", () => {
  it("sma/ema/atr/rsi devuelven NaN antes de tener datos suficientes", () => {
    expect(Number.isNaN(sma(closes, 20)[18])).toBe(true);
    expect(Number.isNaN(ema(closes, 200)[198])).toBe(true);
    expect(Number.isNaN(atr(highs, lows, closes, 14)[12])).toBe(true);
    expect(Number.isNaN(rsi(closes, 14)[13])).toBe(true);
    // y cualquier comparación con NaN da falso: una señal no puede dispararse en el calentamiento
    expect(closes[10] > ema(closes, 200)[10]).toBe(false);
  });
});

describe("indicadores: misma matemática que src/bot/data.ts después del calentamiento", () => {
  const df = new DataFetcher();

  it("ema", () => {
    const ref = df.calculateEMA(closes, 50);
    const mine = ema(closes, 50);
    for (let i = 49; i < closes.length; i++) expect(mine[i]).toBeCloseTo(ref[i], 10);
  });

  it("atr", () => {
    const ref = df.calculateATR(candles, 14);
    const mine = atr(highs, lows, closes, 14);
    for (let i = 13; i < closes.length; i++) expect(mine[i]).toBeCloseTo(ref[i], 10);
  });

  it("sma", () => {
    const ref = df.calculateSMA(closes, 20);
    const mine = sma(closes, 20);
    for (let i = 19; i < closes.length; i++) expect(mine[i]).toBeCloseTo(ref[i], 10);
  });

  it("rsi", () => {
    const ref = df.calculateRSI(closes, 14);
    const mine = rsi(closes, 14);
    for (let i = 14; i < closes.length; i++) expect(mine[i]).toBeCloseTo(ref[i], 10);
  });
});

describe("rollingMax / rollingMin / shift", () => {
  const v = [3, 1, 4, 1, 5, 9, 2, 6];

  it("ventana que termina en i, incluida", () => {
    expect(Array.from(rollingMax(v, 3)).slice(2)).toEqual([4, 4, 5, 9, 9, 9]);
    expect(Array.from(rollingMin(v, 3)).slice(2)).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it("shift desplaza hacia atrás sin mirar el futuro", () => {
    const s = shift(v, 1);
    expect(Number.isNaN(s[0])).toBe(true);
    expect(s[5]).toBe(5);
  });
});
