import { describe, it, expect } from "vitest";
import { HOUR_MS, DAY_MS, resample, type Candle } from "../src/backtest/data/candles.js";
import { toSeries } from "../src/backtest/data/load.js";
import { simulate } from "../src/backtest/engine/simulate.js";
import { DEFAULT_SIM_CONFIG, type InstrumentData, type Strategy } from "../src/backtest/engine/types.js";
import {
  closedOnly, topByMedianVolume, posReading, decidePosEntries, resolvePos, posPnl, decideCarry, carryPnl, trendSignal,
  POS_HOLD_MS, POS_STRATEGY, CARRY_STRATEGY, type PosCandidate,
} from "../src/shadow/logic.js";
import { runShadow, type ShadowRow, type ShadowStore } from "../src/shadow/runner.js";
import type { BinancePublic } from "../src/shadow/binancePublic.js";

const T0 = Date.parse("2026-01-01T00:00:00Z");

function bar(openTime: number, o: number, h: number, l: number, c: number, qv = 1e6): Candle {
  return { openTime, open: o, high: h, low: l, close: c, volume: 1, quoteVolume: qv, trades: 1, takerBuyVolume: 0.5 };
}
const flatBars = (n: number, ms: number, price = 100, start = T0, qv = 1e6) => Array.from({ length: n }, (_, k) => bar(start + k * ms, price, price, price, price, qv));

describe("universo y lectura de POS", () => {
  it("closedOnly descarta la vela en curso", () => {
    const c = flatBars(3, DAY_MS);
    expect(closedOnly(c, DAY_MS, T0 + 2 * DAY_MS + 1).length).toBe(2);
  });

  it("topByMedianVolume rankea por mediana de 30 días cerrados (ignora la vela de hoy)", () => {
    const now = T0 + 31 * DAY_MS + 5 * HOUR_MS;
    const a = flatBars(32, DAY_MS, 10, T0, 100);
    const b = flatBars(32, DAY_MS, 10, T0, 50);
    b[31] = bar(T0 + 31 * DAY_MS, 10, 10, 10, 10, 1e12); // hoy, en curso: no cuenta
    expect(topByMedianVolume(new Map([["A", a], ["B", b]]), now).map((x) => x.symbol)).toEqual(["A", "B"]);
  });

  it("posReading usa la última vela de 4h cerrada y entra al open de la siguiente", () => {
    const n = 200;
    const k4 = Array.from({ length: n + 1 }, (_, k) => bar(T0 + k * 4 * HOUR_MS, 100 + (k % 3), 102 + (k % 3), 99 + (k % 3), 100 + (k % 3)));
    // Ratio estable con ruido y un salto en la última vela cerrada.
    const ratios = Array.from({ length: 180 }, (_, k) => ({ time: T0 + (n - 179 + k) * 4 * HOUR_MS, ratio: 1 + ((k * 7) % 5) / 100 }));
    ratios[179].ratio = 2;
    const now = T0 + n * 4 * HOUR_MS + 3 * 60_000; // 3 min después del cierre de la vela n−1
    const r = posReading(k4, ratios, now)!;
    expect(r.barClose).toBe(T0 + n * 4 * HOUR_MS);
    expect(r.entryOpen).toBe(k4[n].open);
    expect(r.z).toBeGreaterThan(2);
  });
});

describe("decidePosEntries", () => {
  const cand = (symbol: string, z: number, rank = 5): PosCandidate => ({ symbol, rank, z, ratio: 1, atr: 2, barClose: T0, entryOpen: 100 });

  it("largos saturados → corto con stop arriba; cortos saturados → largo; respeta umbral", () => {
    const { enter } = decidePosEntries([cand("A", 2.5), cand("B", -3), cand("C", 1.9)], new Set(), 0);
    expect(enter.map((e) => [e.symbol, e.side, e.stop])).toEqual([["B", "long", 95], ["A", "short", 105]]);
    expect(enter[0].exitDue).toBe(T0 + POS_HOLD_MS);
  });

  it("no repite símbolos abiertos y manda al resto a sin_cupo cuando no hay lugar", () => {
    const { enter, noSlot } = decidePosEntries([cand("A", 3), cand("B", 2.5), cand("C", -4)], new Set(["A"]), 4);
    expect(enter.map((e) => e.symbol)).toEqual(["C"]);
    expect(noSlot.map((e) => e.symbol)).toEqual(["B"]);
  });
});

describe("resolvePos", () => {
  const pos = { side: "long" as const, entryTime: T0, stop: 95, exitDue: T0 + 3 * HOUR_MS };

  it("stop tocado dentro de la vela: sale al nivel; con gap, al open", () => {
    expect(resolvePos(pos, [bar(T0, 100, 101, 94, 96)], T0 + 2 * HOUR_MS)).toEqual({ exitTime: T0 + HOUR_MS, rawExit: 95, reason: "stop" });
    expect(resolvePos(pos, [bar(T0, 100, 100, 99, 99), bar(T0 + HOUR_MS, 90, 91, 89, 90)], T0 + 3 * HOUR_MS)?.rawExit).toBe(90);
  });

  it("sale por tiempo al open de la hora del vencimiento; antes, sigue abierta", () => {
    const bars = [0, 1, 2, 3].map((h) => bar(T0 + h * HOUR_MS, 100 + h, 101 + h, 99 + h, 100 + h));
    expect(resolvePos(pos, bars, T0 + 2.5 * HOUR_MS)).toBeNull();
    expect(resolvePos(pos, bars, T0 + 3 * HOUR_MS + 60_000)).toEqual({ exitTime: T0 + 3 * HOUR_MS, rawExit: 103, reason: "time" });
  });

  it("no decide con la vela en curso", () => {
    expect(resolvePos(pos, [bar(T0, 100, 100, 90, 92)], T0 + 30 * 60_000)).toBeNull();
  });
});

describe("posPnl reproduce el simulador del backtest", () => {
  it("mismo trade corto con salida por stop: el neto en % coincide con simulate()", () => {
    // Precio 100 hasta la hora 9; en la hora 10 sube a 110 (toca el stop de 105).
    const price = (h: number) => (h < 10 ? 100 : 110);
    const candles = Array.from({ length: 48 }, (_, h) => {
      const c = price(h);
      const o = h === 0 ? c : price(h - 1);
      return bar(T0 + h * HOUR_MS, o, Math.max(o, c), Math.min(o, c), c);
    });
    const inst: InstrumentData = { id: "X", symbol: "X", h1: toSeries(candles, false), tf: toSeries(resample(candles, 4)), daily: toSeries(resample(candles, 24)), funding: { time: new Float64Array(0), rate: new Float64Array(0) }, minNotional: 5 };
    const strat: Strategy<null> = { id: "s", family: "baseline", timeframeHours: 4, side: "short", prepare: () => null, entry: (_p, i) => (i === 1 ? { score: 1 } : null), plan: () => ({ stop: 105 }) };
    const res = simulate(strat, new Map([["X", inst]]), { btcDaily: inst.daily }, [{ date: T0, ranked: ["X"] }], { ...DEFAULT_SIM_CONFIG, start: T0, end: T0 + 2 * DAY_MS });
    const t = res.trades[0];
    expect(t.exitReason).toBe("stop");
    const p = posPnl("short", 1, 100, 105, "stop", []);
    expect(p.netPct).toBeCloseTo(t.netPnl / t.notional, 10);
  });

  it("el funding positivo lo cobra el corto y lo paga el largo", () => {
    expect(posPnl("short", 1, 100, 100, "time", [0.001, 0.001]).fundingPct).toBeCloseTo(0.002, 12);
    expect(posPnl("long", 1, 100, 100, "time", [0.001]).fundingPct).toBeCloseTo(-0.001, 12);
  });
});

describe("CARRY", () => {
  it("decideCarry: sale bajo T_in/3, entra sobre T_in por señal, hasta 3 abiertas", () => {
    const d = decideCarry(
      [{ symbol: "A", rank: 1, signal: 0.4 }, { symbol: "B", rank: 2, signal: 0.2 }, { symbol: "C", rank: 3, signal: 0.1 }, { symbol: "D", rank: 4, signal: 0.3 }],
      [{ symbol: "X", signal: 0.04 }, { symbol: "Y", signal: 0.2 }]
    );
    expect(d.exit).toEqual(["X"]);
    expect(d.enter.map((c) => c.symbol)).toEqual(["A", "D"]); // queda Y abierta: 2 lugares
    expect(d.noSlot.map((c) => c.symbol)).toEqual(["B"]);
  });

  it("carryPnl: con precios planos es funding menos 4 comisiones y slippage", () => {
    const p = carryPnl(100, 100, 100, 100, 100, [0.001, 0.002]);
    expect(p.fundingPct).toBeCloseTo(0.003, 12);
    expect(p.costPct).toBeCloseTo(2 * (0.001 + 0.0005), 12);
    expect(p.grossPct).toBeLessThan(0); // el slippage de 4 patas pesa en la base
  });
});

describe("runShadow (de punta a punta con datos falsos)", () => {
  function memoryStore() {
    const rows: ShadowRow[] = [];
    const store: ShadowStore = {
      listOpen: async (s) => rows.filter((r) => r.strategy === s && r.status === "abierta"),
      insert: async (rs) => {
        for (const r of rs) if (!rows.some((x) => x.strategy === r.strategy && x.symbol === r.symbol && +x.signalTime === +r.signalTime)) rows.push({ ...r, id: rows.length + 1 });
      },
      close: async (id, f) => Object.assign(rows.find((r) => r.id === id)!, f),
    };
    return { rows, store };
  }

  // Un solo par, "AAAUSDT", con 4h estables y el ratio de cuentas que salta en la última vela cerrada.
  function fakeClient(now: number, opts: { ratioJump: boolean; funding: number }): BinancePublic {
    const k4 = Array.from({ length: 201 }, (_, k) => {
      const t = now - (200 - k) * 4 * HOUR_MS - 3 * 60_000;
      const p = 100 + (k % 3);
      return bar(t, p, p + 2, p - 1, p);
    });
    return {
      perpetuals: async () => [{ symbol: "AAAUSDT", underlyingType: "COIN" }],
      quoteVolumes24h: async () => new Map([["AAAUSDT", 1e9]]),
      klines: async (_s: string, interval: string, o: { startTime?: number } = {}) => {
        if (interval === "1d") return flatBars(32, DAY_MS, 100, Math.floor(now / DAY_MS) * DAY_MS - 31 * DAY_MS);
        if (interval === "4h") return k4;
        return Array.from({ length: 100 }, (_, h) => bar((o.startTime ?? 0) + h * HOUR_MS, 100, 100.5, 99.5, 100)).filter((b) => b.openTime <= now);
      },
      longShortAccountRatio: async () =>
        k4.slice(21, 201).map((c, k) => ({ time: c.openTime, ratio: opts.ratioJump && k === 179 ? 3 : 1 + ((k * 7) % 5) / 100 })),
      fundingRates: async (_s: string, start: number) => Array.from({ length: 90 }, (_, k) => ({ time: start + k * 8 * HOUR_MS, rate: opts.funding })).filter((f) => f.time < now),
      perpPrice: async () => 100,
      spotPrices: async () => new Map([["AAAUSDT", 100]]),
    } as unknown as BinancePublic;
  }

  it("abre una posición virtual de POS y la cierra por tiempo a las 72 h", async () => {
    const { rows, store } = memoryStore();
    const now = Date.parse("2026-10-06T12:03:00Z");
    const s1 = await runShadow(fakeClient(now, { ratioJump: true, funding: 0.0001 }), store, now);
    expect(s1.errors).toEqual([]);
    expect(s1.posOpened).toBe(1);
    const pos = rows.find((r) => r.strategy === POS_STRATEGY)!;
    expect(pos.side).toBe("short");

    const later = now + 73 * HOUR_MS;
    const s2 = await runShadow(fakeClient(later, { ratioJump: false, funding: 0.0001 }), store, later);
    expect(s2.posClosed).toBe(1);
    expect(pos.status).toBe("cerrada");
    expect(pos.exitReason).toBe("time");
    expect(Number(pos.fundingPct)).toBeGreaterThan(0); // el corto cobra funding positivo
  });

  it("CARRY solo decide en la corrida posterior a las 00:00 UTC y entra con funding alto", async () => {
    const { rows, store } = memoryStore();
    const noon = Date.parse("2026-10-06T12:03:00Z");
    await runShadow(fakeClient(noon, { ratioJump: false, funding: 0.0005 }), store, noon);
    expect(rows.filter((r) => r.strategy === CARRY_STRATEGY)).toHaveLength(0);
    const midnight = Date.parse("2026-10-07T00:03:00Z");
    const s = await runShadow(fakeClient(midnight, { ratioJump: false, funding: 0.0005 }), store, midnight);
    expect(s.carryOpened).toBe(1);
  });

  it("una corrida repetida no duplica señales", async () => {
    const { rows, store } = memoryStore();
    const now = Date.parse("2026-10-06T12:03:00Z");
    await runShadow(fakeClient(now, { ratioJump: true, funding: 0 }), store, now);
    await runShadow(fakeClient(now + 60_000, { ratioJump: true, funding: 0 }), store, now + 60_000);
    expect(rows.filter((r) => r.strategy === POS_STRATEGY)).toHaveLength(1);
  });
});

describe("TREND (línea base del torneo)", () => {
  const days = (n: number, price: (d: number) => number, endDay: number) =>
    Array.from({ length: n }, (_, k) => {
      const d = endDay - (n - 1 - k);
      const p = price(k);
      return bar(d * DAY_MS, p, p, p, p);
    });

  it("trendSignal usa solo velas diarias cerradas y exige 200 días", () => {
    const today = Math.floor(Date.parse("2026-10-07T00:03:00Z") / DAY_MS);
    const up = days(201, (k) => 100 + k, today); // la última es la de hoy, en curso: no cuenta
    const sig = trendSignal(up, today * DAY_MS + 3 * 60_000)!;
    expect(sig.above).toBe(true);
    expect(trendSignal(days(150, () => 1, today), today * DAY_MS + 60_000)).toBeNull();
  });

  it("runShadow abre TREND con BTC sobre la SMA200 y lo cierra cuando cae debajo", async () => {
    const rows: ShadowRow[] = [];
    const store: ShadowStore = {
      listOpen: async (s) => rows.filter((r) => r.strategy === s && r.status === "abierta"),
      insert: async (rs) => { for (const r of rs) rows.push({ ...r, id: rows.length + 1 }); },
      close: async (id, f) => Object.assign(rows.find((r) => r.id === id)!, f),
    };
    const client = (now: number, btc: (k: number) => number) => {
      const today = Math.floor(now / DAY_MS);
      return {
        perpetuals: async () => [],
        quoteVolumes24h: async () => new Map(),
        klines: async (s: string, interval: string) => (s === "BTCUSDT" && interval === "1d" ? days(260, btc, today) : []),
        longShortAccountRatio: async () => [],
        fundingRates: async (_s: string, start: number) => [{ time: start + 8 * 3_600_000, rate: 0.0001 }],
        perpPrice: async () => btc(259),
        spotPrices: async () => new Map(),
      } as unknown as BinancePublic;
    };
    const d1 = Date.parse("2026-10-07T00:03:00Z");
    const s1 = await runShadow(client(d1, (k) => 100 + k), store, d1);
    expect(s1.trend).toBe("abre");
    const d2 = Date.parse("2026-10-20T00:03:00Z");
    const s2 = await runShadow(client(d2, (k) => (k < 250 ? 100 + k : 50)), store, d2); // desplome: cierra debajo de la SMA
    expect(s2.trend).toBe("cierra");
    const t = rows.find((r) => r.strategy === "TREND_BTC_sma200")!;
    expect(t.status).toBe("cerrada");
    expect(Number(t.netPct)).toBeLessThan(0);
    // En una corrida que no es la de las 00:00 UTC, TREND no decide.
    const noon = Date.parse("2026-10-20T12:03:00Z");
    expect((await runShadow(client(noon, (k) => 100 + k), store, noon)).trend).toBeNull();
  });
});
