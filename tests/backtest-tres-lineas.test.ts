import { describe, it, expect } from "vitest";
import { toSeries } from "../src/backtest/data/load.js";
import { resample, HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import { simulate } from "../src/backtest/engine/simulate.js";
import type { InstrumentData, SimConfig } from "../src/backtest/engine/types.js";
import { listingShortStrategy, firstDailyCloseAtOrAfter, FIRST_ELIGIBLE_LISTING } from "../src/backtest/strategies/listing.js";
import { sampleAtClose, rollingZ, recentFundingMean, positioningStrategy, type PositioningPrepared } from "../src/backtest/strategies/positioning.js";
import { simulateCarry, trailingFundingAnnualized, CARRY_NOTIONAL, SPOT_FEE_RATE, type CarryInstrument, type Ohlc } from "../src/backtest/strategies/carry.js";

const T0 = Date.parse("2023-01-01T00:00:00Z");

function hours(n: number, price: (h: number) => number, start = T0): Candle[] {
  return Array.from({ length: n }, (_, h) => {
    const close = price(h);
    const open = h === 0 ? close : price(h - 1);
    return { openTime: start + h * HOUR_MS, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 };
  });
}

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  start: T0,
  end: T0 + 40 * DAY_MS,
  initialEquity: 300,
  marginPerTrade: 6,
  leverageMin: 1,
  leverageMax: 10,
  notionalFloor: 10,
  maintenanceMarginRate: 0.01,
  maxPositions: 5,
  feeRate: 0.0005,
  slippageTiers: [{ maxRank: 10, bps: 2 }, { maxRank: 100, bps: 10 }],
  stopSlippageMult: 2,
  delistPenalty: 0.05,
  costMultiplier: 1,
  ...over,
});

describe("LIST · cortos a listados nuevos", () => {
  it("firstDailyCloseAtOrAfter: primer cierre diario ≥ t", () => {
    const days = Float64Array.from([0, 1, 2, 3].map((d) => T0 + d * DAY_MS));
    expect(firstDailyCloseAtOrAfter(days, T0 + 8 * HOUR_MS + DAY_MS)).toBe(1); // cierra T0+2d
    expect(firstDailyCloseAtOrAfter(days, T0 + DAY_MS)).toBe(0); // cierre exacto
    expect(firstDailyCloseAtOrAfter(days, T0 + 10 * DAY_MS)).toBe(-1);
  });

  function listedInstrument(id: string, listedAt: number, days: number): InstrumentData {
    const c = hours(days * 24, () => 100, listedAt);
    return { id, symbol: id, h1: toSeries(c, false), tf: toSeries(resample(c, 24)), daily: toSeries(resample(c, 24)), funding: { time: new Float64Array(0), rate: new Float64Array(0) }, minNotional: 5, listedAt };
  }

  it("entra en corto el primer 00:00 ≥ listado + D días, fuera del ranking (peor slippage), y sale a los H días", () => {
    const inst = listedInstrument("NEW", T0, 40);
    const res = simulate(listingShortStrategy({ delayDays: 1, holdDays: 14 }), new Map([["NEW", inst]]), { btcDaily: inst.daily }, [{ date: T0, ranked: ["OTRA"] }], cfg());
    expect(res.trades).toHaveLength(1);
    const t = res.trades[0];
    expect(t.side).toBe("short");
    expect(t.entryTime).toBe(T0 + DAY_MS); // vela diaria 0 cierra a T0+1d
    expect(t.entryPrice).toBeCloseTo(100 * (1 - 0.001), 10); // corto: vende con 10 bps en contra
    expect(t.initialStop).toBeCloseTo(t.entryPrice * 1.3, 10);
    expect(t.exitReason).toBe("time");
    expect(t.exitTime).toBe(T0 + 15 * DAY_MS);
  });

  it("no considera listados anteriores a 2020-03-01 (ya cotizaban al empezar los datos)", () => {
    const old = FIRST_ELIGIBLE_LISTING - DAY_MS;
    const inst = listedInstrument("OLD", old, 40);
    const res = simulate(listingShortStrategy({ delayDays: 1, holdDays: 14 }), new Map([["OLD", inst]]), { btcDaily: inst.daily }, [{ date: old, ranked: ["OLD"] }], cfg({ start: old, end: old + 40 * DAY_MS }));
    expect(res.trades).toHaveLength(0);
  });
});

describe("POS · posicionamiento saturado", () => {
  it("sampleAtClose: toma el último valor conocido al cierre y descarta datos viejos", () => {
    const tf = toSeries(hours(12, () => 1).filter((_, h) => h % 4 === 0).map((c) => ({ ...c })), true);
    // Velas de 4h que abren a T0, T0+4h, T0+8h (cierran a +4h, +8h, +12h).
    const time = Float64Array.from([T0 + 4 * HOUR_MS, T0 + 5 * HOUR_MS, T0 + 6 * HOUR_MS]);
    const vals = Float64Array.from([1, 2, 3]);
    const out = sampleAtClose(tf, 4, time, vals, HOUR_MS);
    expect(out[0]).toBe(1); // cierre +4h: el valor de +4h ya se conoce
    expect(Number.isNaN(out[1])).toBe(true); // cierre +8h: el último (+6h) tiene 2 h → viejo
    expect(Number.isNaN(out[2])).toBe(true);
  });

  it("rollingZ ignora NaN y exige mínimo de valores", () => {
    const x = Float64Array.from([1, 2, NaN, 3, 4, 100]);
    const z = rollingZ(x, 6, 4);
    expect(Number.isNaN(z[3])).toBe(true); // solo 3 válidos hasta acá
    expect(z[5]).toBeGreaterThan(1.5);
  });

  it("recentFundingMean promedia los últimos 3 eventos liquidados al cierre", () => {
    const tf = toSeries([{ openTime: T0, open: 1, high: 1, low: 1, close: 1, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0 }]);
    const f = { time: Float64Array.from([T0 - 16 * HOUR_MS, T0 - 8 * HOUR_MS, T0, T0 + 8 * HOUR_MS]), rate: Float64Array.from([0.1, 0.2, 0.3, 9]) };
    expect(recentFundingMean(tf, 4, f)[0]).toBeCloseTo(0.2, 10); // el de +8h todavía no se liquidó
  });

  const prep = (c: number, zOI = 1): PositioningPrepared => ({ c: Float64Array.from([c]), zOI: Float64Array.from([zOI]), atr14: Float64Array.from([2]) });

  it("contrarian: largos saturados → corto; cortos saturados → largo; prioridad por saturación", () => {
    const s = positioningStrategy({ measure: "ls", holdBars: 6 });
    expect(s.entry(prep(2.5), 0)).toEqual({ score: 2.5, side: "short" });
    expect(s.entry(prep(-3), 0)).toEqual({ score: 3, side: "long" });
    expect(s.entry(prep(1.9), 0)).toBeNull();
    expect(s.plan(prep(2.5), 0, 100, "short")).toEqual({ stop: 105 });
  });

  it("combo exige que el open interest esté creciendo (zOI > 0) y usa umbral 1,5", () => {
    const s = positioningStrategy({ measure: "combo", holdBars: 18 });
    expect(s.entry(prep(1.6, 0.5), 0)).toEqual({ score: 1.6, side: "short" });
    expect(s.entry(prep(1.6, -0.5), 0)).toBeNull();
  });
});

describe("CARRY · spot comprado + perpetuo vendido", () => {
  const flat = (days: number, perp = 100, spot = 100): [Map<number, Ohlc>, Map<number, Ohlc>] => {
    const p = new Map<number, Ohlc>();
    const s = new Map<number, Ohlc>();
    for (let d = -10; d < days; d++) {
      p.set(T0 + d * DAY_MS, { open: perp, high: perp, low: perp, close: perp });
      s.set(T0 + d * DAY_MS, { open: spot, high: spot, low: spot, close: spot });
    }
    return [p, s];
  };
  const fundingEvery8h = (fromDay: number, toDay: number, rate: number) => {
    const t: number[] = [];
    for (let h = fromDay * 24; h < toDay * 24; h += 8) t.push(T0 + h * HOUR_MS);
    return { fundingTime: Float64Array.from(t), fundingRate: Float64Array.from(t, () => rate) };
  };
  const noSlip = { slippageTiers: [{ maxRank: 100, bps: 0 }] };

  it("trailingFundingAnnualized: suma 7 días y anualiza", () => {
    const f = fundingEvery8h(-7, 0, 0.0001); // 21 eventos
    expect(trailingFundingAnnualized(f.fundingTime, f.fundingRate, T0)).toBeCloseTo((21 * 0.0001 * 365) / 7, 10);
  });

  it("con precios planos, el PnL es el funding cobrado menos las comisiones de las 4 patas", () => {
    const [perp, spot] = flat(20);
    const f = fundingEvery8h(-10, 20, 0.0003); // ~33 % anual: entra
    const inst: CarryInstrument = { symbol: "X", perp, spot, ...f };
    const res = simulateCarry("c", { tIn: 0.15, universe: "btc_eth" }, new Map([["X", inst]]), () => [{ symbol: "X", rank: 1 }], cfg({ end: T0 + 10 * DAY_MS, ...noSlip }));
    expect(res.trades).toHaveLength(1);
    const t = res.trades[0];
    expect(t.exitReason).toBe("end");
    expect(t.grossPnl).toBeCloseTo(0, 10);
    const qty = CARRY_NOTIONAL / 100;
    expect(t.fees).toBeCloseTo(2 * qty * 100 * (SPOT_FEE_RATE + 0.0005), 10);
    // Entra a las 00:00 del día 0 sin cobrar ese evento; cobra los de los días 0..8 (cierra al empezar el día 10).
    expect(t.funding).toBeGreaterThan(0);
    expect(t.netPnl).toBeCloseTo(t.funding - t.fees, 10);
  });

  it("gana si la base se cierra (el perpetuo baja respecto del spot) y sale cuando el funding deja de pagar", () => {
    const perp = new Map<number, Ohlc>();
    const spot = new Map<number, Ohlc>();
    for (let d = -10; d < 20; d++) {
      const p = d < 3 ? 101 : 100; // base +1 al entrar, 0 después
      perp.set(T0 + d * DAY_MS, { open: p, high: p, low: p, close: p });
      spot.set(T0 + d * DAY_MS, { open: 100, high: 100, low: 100, close: 100 });
    }
    // Funding alto hasta el día 2, después cero: la señal de 7 días cae bajo T_out más adelante.
    const f = fundingEvery8h(-10, 2, 0.0003);
    const inst: CarryInstrument = { symbol: "X", perp, spot, ...f };
    const res = simulateCarry("c", { tIn: 0.15, universe: "btc_eth" }, new Map([["X", inst]]), () => [{ symbol: "X", rank: 1 }], cfg({ end: T0 + 20 * DAY_MS, ...noSlip }));
    const t = res.trades[0];
    expect(t.exitReason).toBe("signal");
    const qty = CARRY_NOTIONAL / 101;
    expect(t.grossPnl).toBeCloseTo(qty * (101 - 100), 10); // el corto de perpetuo ganó la base
  });

  it("liquidación de la pata corta: cierra las dos patas con penalización", () => {
    const [perp, spot] = flat(20);
    perp.set(T0 + 3 * DAY_MS, { open: 100, high: 250, low: 100, close: 100 });
    const f = fundingEvery8h(-10, 20, 0.0003);
    const res = simulateCarry("c", { tIn: 0.15, universe: "btc_eth" }, new Map([["X", { symbol: "X", perp, spot, ...f }]]), () => [{ symbol: "X", rank: 1 }], cfg({ end: T0 + 10 * DAY_MS, ...noSlip }));
    expect(res.trades[0].exitReason).toBe("liquidation");
    expect(res.trades[0].fees).toBeGreaterThan(0.01 * CARRY_NOTIONAL);
  });

  it("no entra si la señal no supera T_in", () => {
    const [perp, spot] = flat(20);
    const f = fundingEvery8h(-10, 20, 0.0001); // ~11 % anual
    const res = simulateCarry("c", { tIn: 0.15, universe: "btc_eth" }, new Map([["X", { symbol: "X", perp, spot, ...f }]]), () => [{ symbol: "X", rank: 1 }], cfg({ end: T0 + 10 * DAY_MS }));
    expect(res.trades).toHaveLength(0);
  });
});
