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
  maintenanceMarginRate: 0.01,
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

  it("con x10 de máximo, BTC (mínimo 50) entra a x9 y se liquida si cae más que el margen antes del stop", () => {
    // Precio 100 hasta la hora 9, después se desploma a 80 (−20 %). Stop en 85 (más lejos que la
    // liquidación, ~89,9 a x9): pierde todo el margen (6), no el −15 % del stop.
    const price = (h: number) => (h < 10 ? 100 : 80);
    const btc = instrument("BTC", hours(72, price), 4, [], 50);
    const res = simulate(stubStrategy({ BTC: { bar: 1, score: 1 } }, 85), new Map([["BTC", btc]]), { btcDaily: btc.daily }, universe(["BTC"]),
      cfg({ initialEquity: 30, marginPerTrade: 6, leverageMin: 1, leverageMax: 10 }));
    const t = res.trades[0];
    expect(t.leverage).toBe(9);
    expect(t.exitReason).toBe("liquidation");
    expect(t.grossPnl).toBe(-6);
    expect(t.netPnl).toBeCloseTo(-6 - 54 * 0.0005, 10); // margen + comisión de entrada
  });

  it("Regla 1: escala el apalancamiento hasta alcanzar el notional y lo registra en el trade", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const res = simulate(stubStrategy({ A: { bar: 1, score: 1 } }, 50), new Map([["A", a]]), { btcDaily: a.daily }, universe(["A"]),
      cfg({ initialEquity: 30, marginPerTrade: 6, leverageMin: 1, leverageMax: 2 }));
    expect(res.trades[0].leverage).toBe(2);
    expect(res.trades[0].notional).toBeCloseTo(12, 10);
  });

  it("maxRank: no entra en instrumentos fuera del top indicado del universo", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const b = instrument("B", hours(72, () => 100), 4);
    const strat = { ...stubStrategy({ A: { bar: 1, score: 1 }, B: { bar: 1, score: 9 } }, 50), maxRank: 1 };
    const res = simulate(strat, new Map([["A", a], ["B", b]]), { btcDaily: a.daily }, universe(["A", "B"]), cfg());
    expect(res.trades.map((t) => t.instrument)).toEqual(["A"]);
  });

  it("filtro cross-sectional: solo entra en el top K por score, rankeando todo el universo", () => {
    const ids = ["A", "B", "C"];
    const insts = new Map(ids.map((id) => [id, instrument(id, hours(72, () => 100), 4)]));
    const rsScore: Record<string, number> = { A: 1, B: 3, C: 2 };
    const strat = {
      ...stubStrategy({ A: { bar: 1, score: 1 }, B: { bar: 1, score: 1 }, C: { bar: 1, score: 1 } }, 50),
      crossSectionalTopK: 2,
      crossSectionalScore: (p: { id: string }) => rsScore[p.id],
    };
    const res = simulate(strat, insts, { btcDaily: insts.get("A")!.daily }, universe(ids), cfg());
    expect(res.trades.map((t) => t.instrument).sort()).toEqual(["B", "C"]);
  });
});

describe("simulate con largos y cortos en la misma cuenta (side: both)", () => {
  /** Entra en la vela de 4h #1 con el lado indicado por instrumento; stop/TP en precio. */
  function bothStrategy(sides: Record<string, "long" | "short">, levels: Record<string, { stop: number; tp?: number }>): Strategy<{ id: string }> {
    return {
      id: "both",
      family: "baseline",
      timeframeHours: 4,
      side: "both",
      prepare: (inst) => ({ id: inst.id }),
      entry: (p, i) => (i === 1 && sides[p.id] ? { score: 1, side: sides[p.id] } : null),
      plan: (p) => ({ stop: levels[p.id].stop, takeProfit: levels[p.id].tp }),
    };
  }

  it("un corto gana cuando el precio baja, con el TP y el stop del lado correcto", () => {
    const price = (h: number) => (h < 12 ? 100 : 80);
    const a = instrument("A", hours(72, price), 4);
    const res = simulate(bothStrategy({ A: "short" }, { A: { stop: 110, tp: 90 } }), new Map([["A", a]]), { btcDaily: a.daily }, universe(["A"]), cfg());
    const t = res.trades[0];
    expect(t.side).toBe("short");
    expect(t.exitReason).toBe("take_profit");
    expect(t.exitPrice).toBe(90);
    expect(t.grossPnl).toBeCloseTo(1 * (100 - 90), 10);
  });

  it("un largo y un corto conviven y el funding se cobra con el signo de cada lado", () => {
    const funding = [{ time: T0 + 16 * HOUR_MS, rate: 0.01 }];
    const a = instrument("A", hours(72, () => 100), 4, funding);
    const b = instrument("B", hours(72, () => 100), 4, funding);
    const res = simulate(
      bothStrategy({ A: "long", B: "short" }, { A: { stop: 50 }, B: { stop: 150 } }),
      new Map([["A", a], ["B", b]]),
      { btcDaily: a.daily },
      universe(["A", "B"]),
      cfg()
    );
    const byId = Object.fromEntries(res.trades.map((t) => [t.instrument, t]));
    expect(byId.A.side).toBe("long");
    expect(byId.B.side).toBe("short");
    expect(byId.A.funding).toBeCloseTo(-1, 10); // el long paga
    expect(byId.B.funding).toBeCloseTo(1, 10); // el short cobra
  });

  it("un plan con el stop del lado equivocado para ese lado no se opera", () => {
    const a = instrument("A", hours(72, () => 100), 4);
    const res = simulate(bothStrategy({ A: "short" }, { A: { stop: 90 } }), new Map([["A", a]]), { btcDaily: a.daily }, universe(["A"]), cfg());
    expect(res.trades).toHaveLength(0);
  });

  it("allowEntry ve las posiciones ya abiertas (incluidas las de la misma hora) y puede bloquear", () => {
    const ids = ["A", "B", "C"];
    const insts = new Map(ids.map((id) => [id, instrument(id, hours(72, () => 100), 4)]));
    const strat: Strategy<{ id: string }> = {
      ...bothStrategy({ A: "long", B: "long", C: "short" }, { A: { stop: 50 }, B: { stop: 50 }, C: { stop: 150 } }),
      // Una sola posición por lado.
      allowEntry: (c, open) => !open.some((o) => o.side === c.side),
    };
    const res = simulate(strat, insts, { btcDaily: insts.get("A")!.daily }, universe(ids), cfg());
    expect(res.trades.map((t) => `${t.instrument}:${t.side}`).sort()).toEqual(["A:long", "C:short"]);
    expect(res.skippedFiltered).toBe(1);
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
