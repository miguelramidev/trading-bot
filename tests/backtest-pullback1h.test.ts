import { describe, it, expect } from "vitest";
import { toSeries } from "../src/backtest/data/load.js";
import { HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import {
  returnsCorrelation,
  btcMacro,
  lastFunding,
  trend4h,
  alignHigher,
  resampleSeries,
  pullback1hStrategy,
  type Pullback1hPrepared,
} from "../src/backtest/strategies/pullback1h.js";
import type { ExitParams } from "../src/backtest/strategies/common.js";

const T0 = 1000 * DAY_MS;

function hourly(closes: number[], start = T0): Candle[] {
  return closes.map((close, h) => {
    const open = h === 0 ? close : closes[h - 1];
    return { openTime: start + h * HOUR_MS, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 };
  });
}

/** Serie de precios a partir de retornos simples. */
function pricesFrom(rets: number[], start = 100): number[] {
  let p = start;
  return rets.map((r, k) => (k === 0 ? p : (p *= 1 + r)));
}

const rets = Array.from({ length: 400 }, (_, k) => ((k * 7919) % 13) / 1000 - 0.006);

describe("returnsCorrelation", () => {
  it("una moneda que replica los retornos de BTC tiene correlación ~1; la inversa, ~−1", () => {
    const btc = toSeries(hourly(pricesFrom(rets)));
    const same = toSeries(hourly(pricesFrom(rets.map((r) => 2 * r))));
    const inv = toSeries(hourly(pricesFrom(rets.map((r) => -r))));
    expect(returnsCorrelation(same, btc)[300]).toBeGreaterThan(0.99);
    expect(returnsCorrelation(inv, btc)[300]).toBeLessThan(-0.99);
  });

  it("mide retornos y no precios: dos tendencias paralelas sin relación en sus retornos no dan ~1", () => {
    // Las dos suben (correlación de PRECIOS ~1), pero sus retornos horarios no se relacionan.
    const a = rets.map((r, k) => 0.002 + (k % 2 ? r : -r));
    const b = rets.map((r) => 0.002 + r);
    const corr = returnsCorrelation(toSeries(hourly(pricesFrom(a))), toSeries(hourly(pricesFrom(b))))[300];
    expect(Math.abs(corr)).toBeLessThan(0.5);
  });

  it("alinea por hora: la moneda que empieza más tarde se compara con la misma hora de BTC", () => {
    const btc = toSeries(hourly(pricesFrom(rets)));
    const late = toSeries(hourly(pricesFrom(rets.slice(100)), T0 + 100 * HOUR_MS));
    expect(returnsCorrelation(late, btc)[250]).toBeGreaterThan(0.99);
  });

  it("NaN mientras no haya suficientes pares", () => {
    const btc = toSeries(hourly(pricesFrom(rets)));
    expect(Number.isNaN(returnsCorrelation(btc, btc)[50])).toBe(true);
  });
});

describe("alineación sin look-ahead", () => {
  it("alignHigher: a la vela de 1h que cierra a las 04:00 le corresponde la vela de 4h 00–04, no la siguiente", () => {
    const tf = toSeries(hourly(Array.from({ length: 12 }, (_, k) => 100 + k)));
    const h4 = resampleSeries(tf, 4);
    const idx = alignHigher(tf, 1, h4, 4);
    expect(idx[2]).toBe(-1); // cierra 03:00: ninguna de 4h cerrada todavía
    expect(idx[3]).toBe(0); // cierra 04:00: cerró la de 00–04
    expect(idx[6]).toBe(0);
    expect(idx[7]).toBe(1);
  });

  it("trend4h no cambia por una vela de 1h dentro de la vela de 4h en curso", () => {
    // 60 velas de 4h subiendo (tendencia alcista), después un desplome en la hora 241.
    const closes = Array.from({ length: 244 }, (_, h) => 100 + h * 0.5);
    closes[241] = 10;
    const t = trend4h(toSeries(hourly(closes)));
    expect(t[240]).toBe(1);
    expect(t[241]).toBe(1); // el desplome está en la vela de 4h que todavía no cerró
  });

  it("lastFunding solo ve eventos liquidados hasta el cierre de la vela", () => {
    const tf = toSeries(hourly([1, 1, 1, 1]));
    const f = lastFunding(tf, 1, { time: Float64Array.from([T0 + 2 * HOUR_MS]), rate: Float64Array.from([0.001]) });
    expect(Number.isNaN(f[0])).toBe(true); // cierra a la hora 1
    expect(f[1]).toBe(0.001); // cierra a la hora 2: ya liquidó
  });

  it("btcMacro usa la última vela diaria CERRADA (definición de analyze.ts)", () => {
    // 260 días subiendo → ALCISTA; el día 260 se desploma, pero eso solo se ve al cerrar ese día.
    const daily = Array.from({ length: 261 }, (_, d) => ({ openTime: d * DAY_MS, open: 100 + d, high: 100 + d, low: 100 + d, close: d === 260 ? 1 : 100 + d, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 }));
    const btcDaily = toSeries(daily);
    const tf = toSeries(hourly([1, 1], 260 * DAY_MS)); // horas del día 260
    expect(btcMacro(tf, 1, btcDaily)[0]).toBe(1);
  });
});

describe("pullback1hStrategy: entradas y filtros", () => {
  const EXIT: ExitParams = { mode: "bracket", stopAtr: 1.5, m: 3 };
  const ALL = { macro: true, funding: true, exposure: true };

  /** Prepared sintético de una sola vela (i = 0) con un gatillo RSI(2) disparado. */
  function prep(over: Partial<{ trend: number; macro: number; corr: number; funding: number; rsi2: number; isBtc: boolean }> = {}): Pullback1hPrepared {
    const o = { trend: 1, macro: 0, corr: 0.5, funding: 0.0001, rsi2: 5, isBtc: false, ...over };
    const one = (v: number) => Float64Array.from([v]);
    const exitArr = { atr: one(1), extreme22: one(100) };
    return {
      isBtc: o.isBtc,
      high: one(101),
      low: one(99),
      close: one(100),
      rsi2: one(o.rsi2),
      ema21: one(100),
      trend: Int8Array.from([o.trend]),
      macro: Int8Array.from([o.macro]),
      corr: one(o.corr),
      funding: one(o.funding),
      exitLong: exitArr,
      exitShort: exitArr,
    };
  }

  const s = pullback1hStrategy({ trigger: "rsi2", exit: EXIT, filters: ALL });

  it("largo en tendencia alcista con RSI(2) < 10; corto en bajista con RSI(2) > 90", () => {
    expect(s.entry(prep(), 0)).toEqual({ score: 0, side: "long" });
    expect(s.entry(prep({ trend: -1, rsi2: 95 }), 0)).toEqual({ score: 0, side: "short" });
    expect(s.entry(prep({ trend: 0 }), 0)).toBeNull();
    expect(s.entry(prep({ rsi2: 50 }), 0)).toBeNull();
  });

  it("macro: con correlación positiva no opera en contra de BTC", () => {
    expect(s.entry(prep({ macro: -1 }), 0)).toBeNull(); // largo con BTC BAJISTA
    expect(s.entry(prep({ trend: -1, rsi2: 95, macro: 1 }), 0)).toBeNull(); // corto con BTC ALCISTA
    expect(s.entry(prep({ macro: 1 }), 0)).not.toBeNull();
  });

  it("macro: con correlación negativa la moneda se evalúa sola", () => {
    expect(s.entry(prep({ macro: -1, corr: -0.3 }), 0)).toEqual({ score: 0, side: "long" });
  });

  it("macro: sin correlación medible obedece a BTC", () => {
    expect(s.entry(prep({ macro: -1, corr: NaN }), 0)).toBeNull();
  });

  it("funding extremo en contra veta la entrada", () => {
    expect(s.entry(prep({ funding: -0.0006 }), 0)).toBeNull();
    expect(s.entry(prep({ trend: -1, rsi2: 95, funding: 0.0006 }), 0)).toBeNull();
    expect(s.entry(prep({ funding: 0.0006 }), 0)).not.toBeNull(); // funding alto no veta un largo
  });

  it("sin filtros, los vetos no aplican", () => {
    const raw = pullback1hStrategy({ trigger: "rsi2", exit: EXIT, filters: { macro: false, funding: false, exposure: false } });
    expect(raw.entry(prep({ macro: -1, funding: -0.01 }), 0)).not.toBeNull();
    expect(raw.allowEntry).toBeUndefined();
  });

  it("exposición: bloquea una segunda posición del mismo lado si las dos siguen a BTC (> 20 %)", () => {
    const open = [{ instrument: "X", side: "long" as const, prepared: prep({ corr: 0.6 }), entryTfIndex: 0 }];
    expect(s.allowEntry!({ instrument: "Y", side: "long", prepared: prep({ corr: 0.5 }), i: 0 }, open)).toBe(false);
    expect(s.allowEntry!({ instrument: "Y", side: "short", prepared: prep({ corr: 0.5 }), i: 0 }, open)).toBe(true);
    expect(s.allowEntry!({ instrument: "Y", side: "long", prepared: prep({ corr: 0.1 }), i: 0 }, open)).toBe(true);
    const openBtc = [{ instrument: "BTCUSDT", side: "long" as const, prepared: prep({ isBtc: true, corr: NaN }), entryTfIndex: 0 }];
    expect(s.allowEntry!({ instrument: "Y", side: "long", prepared: prep({ corr: 0.5 }), i: 0 }, openBtc)).toBe(false);
  });

  it("plan: el stop y el TP quedan del lado correcto para cada lado", () => {
    const p = prep();
    expect(s.plan(p, 0, 100, "long")).toEqual({ stop: 98.5, takeProfit: 103 });
    expect(s.plan(p, 0, 100, "short")).toEqual({ stop: 101.5, takeProfit: 97 });
  });
});
