import { describe, it, expect } from "vitest";
import { simulate, regla1Leverage } from "../src/backtest/engine/simulate.js";
import { resample, HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import { toSeries } from "../src/backtest/data/load.js";
import type { InstrumentData, SimConfig, Strategy } from "../src/backtest/engine/types.js";
import type { UniverseSnapshot } from "../src/backtest/universe.js";

const T0 = 100 * DAY_MS; // origen arbitrario, alineado a 00:00 UTC

/** Velas de 1h: `price(h)` define el cierre de la hora h; open = cierre previo; high/low = ±`wick`. */
function hours(n: number, price: (h: number) => number, wick = 0): Candle[] {
  return Array.from({ length: n }, (_, h) => {
    const close = price(h);
    const open = h === 0 ? close : price(h - 1);
    return { openTime: T0 + h * HOUR_MS, open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close, volume: 1, quoteVolume: 1, trades: 1, takerBuyVolume: 0.5 };
  });
}

function instrument(id: string, candles: Candle[], tfHours: number, funding: { time: number; rate: number }[] = [], minNotional = 5): InstrumentData {
  return {
    id,
    symbol: id,
    h1: toSeries(candles, false),
    tf: toSeries(resample(candles, tfHours)),
    daily: toSeries(resample(candles, 24)),
    funding: { time: Float64Array.from(funding, (f) => f.time), rate: Float64Array.from(funding, (f) => f.rate) },
    minNotional,
  };
}

/** Estrategia de prueba: entra cuando la vela de 4h `entryBar` cierra; stop/TP fijos en precio. */
function stubStrategy(entryBars: Record<string, { bar: number; score: number }>, stop: number, takeProfit?: number): Strategy<{ id: string }> {
  return {
    id: "stub",
    family: "baseline",
    timeframeHours: 4,
    side: "long",
    prepare: (inst) => ({ id: inst.id }),
    entry: (p, i) => (entryBars[p.id]?.bar === i ? { score: entryBars[p.id].score } : null),
    plan: () => ({ stop, takeProfit }),
  };
}

const universe = (ids: string[]): UniverseSnapshot[] => [{ date: T0, ranked: ids }];

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  start: T0,
  end: T0 + 3 * DAY_MS,
  initialEquity: 1000,
  marginPerTrade: 50,
  leverageMin: 2,
  leverageMax: 2,
  notionalFloor: 10,
  maxPositions: 5,
  feeRate: 0.0005,
  slippageTiers: [{ maxRank: 100, bps: 0 }],
  stopSlippageMult: 2,
  delistPenalty: 0.05,
  costMultiplier: 1,
  ...over,
});

describe("simulate", () => {
  it("entra al OPEN de la vela siguiente a la señal (no al cierre de la vela de señal) y calcula PnL y comisiones", () => {
    // Precio 100 hasta la hora 7, salta a 104 en la hora 8 (open de la vela de 4h #2) y sube a 120.
    const price = (h: number) => (h < 8 ? 100 : h < 12 ? 104 : 120);
    const inst = instrument("A", hours(72, price), 4);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 90, 115), new Map([["A", inst]]), { btcDaily: inst.daily }, universe(["A"]), cfg());
    expect(res.trades).toHaveLength(1);
    const t = res.trades[0];
    // La vela de 4h #1 (horas 4–7) cierra en H=8; el fill es el open de la hora 8 = cierre de la 7 = 100.
    expect(t.entryTime).toBe(T0 + 8 * HOUR_MS);
    expect(t.entryPrice).toBe(100);
    expect(t.exitReason).toBe("take_profit");
    // Hora 12: abre en 104 y cierra en 120 → TP 115 tocado dentro de la vela.
    expect(t.exitPrice).toBe(115);
    const qty = 100 / 100; // notional 50 × 2
    expect(t.grossPnl).toBeCloseTo(qty * 15, 10);
    expect(t.fees).toBeCloseTo(qty * 100 * 0.0005 + qty * 115 * 0.0005, 10);
    expect(t.rMultiple).toBeCloseTo(t.netPnl / (qty * 10), 10);
  });

  it("cobra el funding de las horas en que la posición está abierta", () => {
    const inst = instrument("A", hours(72, () => 100), 4, [
      { time: T0 + 8 * HOUR_MS, rate: 0.01 }, // misma hora de la entrada: no corresponde
      { time: T0 + 16 * HOUR_MS, rate: 0.01 }, // con la posición abierta: paga 1 % del notional
    ]);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 50), new Map([["A", inst]]), { btcDaily: inst.daily }, universe(["A"]), cfg());
    expect(res.trades[0].funding).toBeCloseTo(-1, 10); // long paga funding positivo: 1 × 100 × 1 %
  });

  it("respeta el cupo máximo: toma la señal de mayor score y cuenta la que no entró", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const b = instrument("B", hours(72, () => 100), 4);
    const res = simulate(
      stubStrategy({ A: { bar: 1, score: 1 }, B: { bar: 1, score: 5 } }, 50),
      new Map([["A", a], ["B", b]]),
      { btcDaily: a.daily },
      universe(["A", "B"]),
      cfg({ maxPositions: 1 })
    );
    expect(res.trades.map((t) => t.instrument)).toEqual(["B"]);
    expect(res.skippedNoSlot).toBe(1);
  });

  it("no opera instrumentos fuera del universo vigente", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 50), new Map([["A", a]]), { btcDaily: a.daily }, universe(["OTRO"]), cfg());
    expect(res.trades).toHaveLength(0);
  });

  it("cierra con penalización si el instrumento deja de cotizar con la posición abierta", () => {
    const a = instrument("A", hours(24, () => 100), 4); // datos hasta la hora 23
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 50), new Map([["A", a]]), { btcDaily: a.daily }, universe(["A"]), cfg());
    expect(res.trades[0].exitReason).toBe("delisted");
    expect(res.trades[0].exitPrice).toBeCloseTo(95, 10);
  });

  it("la equity diaria termina en capital inicial + PnL neto", () => {
    const price = (h: number) => (h < 8 ? 100 : h < 12 ? 104 : 120);
    const inst = instrument("A", hours(72, price), 4);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 90, 115), new Map([["A", inst]]), { btcDaily: inst.daily }, universe(["A"]), cfg());
    expect(res.equity.at(-1)!.equity).toBeCloseTo(1000 + res.trades[0].netPnl, 10);
  });

  it("Regla 1: rechaza el par cuyo mínimo no se alcanza ni con leverageMax (ej. BTC con margen chico)", () => {
    const btc = instrument("BTC", hours(72, () => 100), 4, [], 50);
    const res = simulate(stubStrategy({ BTC: { bar: 1, score: 1 } }, 50), new Map([["BTC", btc]]), { btcDaily: btc.daily }, universe(["BTC"]),
      cfg({ initialEquity: 30, marginPerTrade: 6, leverageMin: 1, leverageMax: 2 }));
    expect(res.trades).toHaveLength(0);
    expect(res.skippedMinNotional).toBe(1);
  });

  it("Regla 1: escala el apalancamiento hasta alcanzar el notional y lo registra en el trade", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 50), new Map([["A", a]]), { btcDaily: a.daily }, universe(["A"]),
      cfg({ initialEquity: 30, marginPerTrade: 6, leverageMin: 1, leverageMax: 2 }));
    expect(res.trades[0].leverage).toBe(2);
    expect(res.trades[0].notional).toBeCloseTo(12, 10);
  });
});

describe("regla1Leverage (mismo algoritmo que Trader.executeTrade)", () => {
  const rango = (leverageMin: number, leverageMax: number) => ({ leverageMin, leverageMax, notionalFloor: 10 });

  it("ejemplo de RULES.md: margen 3, x2–x5, mínimo 10 → x4", () => {
    expect(regla1Leverage(3, 5, rango(2, 5))).toBe(4);
  });

  it("nunca baja de leverageMin aunque sobre notional", () => {
    expect(regla1Leverage(100, 5, rango(3, 5))).toBe(3);
  });

  it("nunca pasa de leverageMax: si no alcanza, rechaza (null)", () => {
    expect(regla1Leverage(6, 50, rango(1, 2))).toBeNull();
  });

  it("leverageMin == leverageMax: ese valor exacto o rechazo", () => {
    expect(regla1Leverage(5, 5, rango(2, 2))).toBe(2);
    expect(regla1Leverage(4, 5, rango(2, 2))).toBeNull();
  });

  it("usa max(piso de 10, minNotional del par)", () => {
    expect(regla1Leverage(6, 20, rango(1, 5))).toBe(4);
  });
});
