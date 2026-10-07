// Corrida del modo sombra (cada 4 h, unos minutos después del cierre de la vela). Solo lee datos
// públicos de Binance y escribe en shadow_signals: no coloca órdenes ni toca el trading real.
//   1. Universo: top 30 por mediana de volumen de 30 días (como el backtest).
//   2. POS: resuelve las posiciones virtuales abiertas y registra las señales nuevas.
//   3. CARRY: en la corrida posterior a las 00:00 UTC, cierra y abre posiciones virtuales.
import { DAY_MS, HOUR_MS, type Candle } from "../backtest/data/candles.js";
import { isEligibleSymbol, spotFor } from "../backtest/data/symbols.js";
import type { BinancePublic } from "./binancePublic.js";
import {
  topByMedianVolume, posReading, decidePosEntries, resolvePos, posPnl, carrySignal, decideCarry, carryPnl, trendSignal, trendPnl,
  POS_STRATEGY, CARRY_STRATEGY, TREND_STRATEGY, TREND_SYMBOL, type PosCandidate,
} from "./logic.js";

/** Pre-filtro por volumen de 24 h antes de pedir 30 días de velas diarias (el top 30 por mediana sale de acá). */
const PRE_UNIVERSE = 80;
const CONCURRENCY = 8;

export interface ShadowRow {
  id?: number;
  strategy: string;
  symbol: string;
  side: "long" | "short";
  rank: number;
  status: "abierta" | "cerrada" | "sin_cupo";
  signalTime: Date;
  signalValue: string | null;
  entryTime: Date;
  entryPrice: string;
  spotEntryPrice?: string | null;
  stopPrice?: string | null;
  exitDue?: Date | null;
  exitTime?: Date | null;
  exitPrice?: string | null;
  spotExitPrice?: string | null;
  exitReason?: string | null;
  grossPct?: string | null;
  costPct?: string | null;
  fundingPct?: string | null;
  netPct?: string | null;
}

export interface ShadowStore {
  listOpen(strategy: string): Promise<ShadowRow[]>;
  /** Inserta ignorando duplicados (strategy, symbol, signalTime): una corrida repetida no duplica. */
  insert(rows: ShadowRow[]): Promise<void>;
  close(id: number, fields: Partial<ShadowRow>): Promise<void>;
}

export async function mapLimit<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}


type Safe = <T>(label: string, fn: () => Promise<T>) => Promise<T | null>;

/** Top 30 por mediana de volumen de 30 días (pre-filtrado por volumen de 24 h). Lo usan el cron y el tablero. */
export async function scanUniverse(client: BinancePublic, now: number, safe: Safe): Promise<{ symbol: string; rank: number }[]> {
  const [perps, vols] = await Promise.all([client.perpetuals(), client.quoteVolumes24h()]);
  const eligible = perps.filter((p) => isEligibleSymbol(p.symbol, p.underlyingType)).map((p) => p.symbol);
  const pre = eligible.sort((a, b) => (vols.get(b) ?? 0) - (vols.get(a) ?? 0)).slice(0, PRE_UNIVERSE);
  const daily = new Map<string, Candle[]>();
  await mapLimit(pre, async (s) => {
    const k = await safe(`diarias ${s}`, () => client.klines(s, "1d", { limit: 32 }));
    if (k) daily.set(s, k);
  });
  return topByMedianVolume(daily, now);
}

/** Lectura de POS (zLS, ATR, precio) de cada moneda del universo sobre la última vela de 4h cerrada. */
export async function scanPositioning(client: BinancePublic, top: { symbol: string; rank: number }[], now: number, safe: Safe): Promise<PosCandidate[]> {
  const readings = await mapLimit(top, async (t) =>
    safe(`POS ${t.symbol}`, async () => {
      const [k4, ratios] = await Promise.all([client.klines(t.symbol, "4h", { limit: 200 }), client.longShortAccountRatio(t.symbol)]);
      const r = posReading(k4, ratios, now);
      return r ? ({ ...r, symbol: t.symbol, rank: t.rank } as PosCandidate) : null;
    })
  );
  return readings.filter((r): r is PosCandidate => r !== null);
}

const pct = (x: number) => x.toFixed(6);

export interface RunSummary {
  universe: number;
  posClosed: number;
  posOpened: number;
  posNoSlot: number;
  carryClosed: number;
  carryOpened: number;
  /** Qué hizo TREND en la corrida diaria (null en las corridas que no son la de las 00:00 UTC). */
  trend: "abre" | "cierra" | "sin cambio" | null;
  errors: string[];
}

export async function runShadow(client: BinancePublic, store: ShadowStore, now: number): Promise<RunSummary> {
  const summary: RunSummary = { universe: 0, posClosed: 0, posOpened: 0, posNoSlot: 0, carryClosed: 0, carryOpened: 0, trend: null, errors: [] };
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      summary.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  // 1. Universo.
  const top = await scanUniverse(client, now, safe);
  summary.universe = top.length;

  // 2a. POS: resolver posiciones abiertas.
  const openPos = await store.listOpen(POS_STRATEGY);
  const stillOpen = new Set<string>();
  for (const row of openPos) {
    const res = await safe(`resolver ${row.symbol}`, async () => {
      const entryTime = row.entryTime.getTime();
      const bars = await client.klines(row.symbol, "1h", { startTime: entryTime, limit: 100 });
      const r = resolvePos({ side: row.side, entryTime, stop: Number(row.stopPrice), exitDue: row.exitDue!.getTime() }, bars, now);
      if (!r) return false;
      const funding = (await client.fundingRates(row.symbol, entryTime)).filter((f) => f.time > entryTime && f.time <= r.exitTime).map((f) => f.rate);
      const p = posPnl(row.side, row.rank, Number(row.entryPrice), r.rawExit, r.reason, funding);
      await store.close(row.id!, {
        status: "cerrada", exitTime: new Date(r.exitTime), exitPrice: String(r.rawExit), exitReason: r.reason,
        grossPct: pct(p.grossPct), costPct: pct(p.costPct), fundingPct: pct(p.fundingPct), netPct: pct(p.netPct),
      });
      return true;
    });
    if (res) summary.posClosed++;
    else stillOpen.add(row.symbol);
  }

  // 2b. POS: señales nuevas sobre la vela de 4h que acaba de cerrar.
  const cands = await scanPositioning(client, top, now, safe);
  const { enter, noSlot } = decidePosEntries(cands, stillOpen, stillOpen.size);
  const posRow = (e: (typeof enter)[number], status: ShadowRow["status"]): ShadowRow => ({
    strategy: POS_STRATEGY, symbol: e.symbol, side: e.side, rank: e.rank, status,
    signalTime: new Date(e.barClose), signalValue: e.z.toFixed(4), entryTime: new Date(e.barClose),
    entryPrice: String(e.entryOpen), stopPrice: String(e.stop), exitDue: new Date(e.exitDue),
  });
  await store.insert([...enter.map((e) => posRow(e, "abierta")), ...noSlot.map((e) => posRow(e, "sin_cupo"))]);
  summary.posOpened = enter.length;
  summary.posNoSlot = noSlot.length;

  // 3. CARRY: solo en la corrida posterior a las 00:00 UTC (decisión diaria, como el backtest).
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  if (now - dayStart < 4 * HOUR_MS) {
    // 3a. TREND: largo en BTC mientras el cierre diario esté sobre la SMA de 200 días.
    await safe("TREND", async () => {
      const t = trendSignal(await client.klines(TREND_SYMBOL, "1d", { limit: 260 }), now);
      if (!t) return;
      const [openTrend] = await store.listOpen(TREND_STRATEGY);
      if (t.above && !openTrend) {
        await store.insert([{
          strategy: TREND_STRATEGY, symbol: TREND_SYMBOL, side: "long", rank: 1, status: "abierta",
          signalTime: new Date(dayStart), signalValue: t.distance.toFixed(4), entryTime: new Date(now), entryPrice: String(await client.perpPrice(TREND_SYMBOL)),
        }]);
        summary.trend = "abre";
      } else if (!t.above && openTrend) {
        const entryTime = openTrend.entryTime.getTime();
        const exit = await client.perpPrice(TREND_SYMBOL);
        const funding = (await client.fundingRates(TREND_SYMBOL, entryTime)).filter((f) => f.time > entryTime && f.time <= now).map((f) => f.rate);
        const p = trendPnl(Number(openTrend.entryPrice), exit, funding);
        await store.close(openTrend.id!, {
          status: "cerrada", exitTime: new Date(now), exitPrice: String(exit), exitReason: "signal",
          grossPct: pct(p.grossPct), costPct: pct(p.costPct), fundingPct: pct(p.fundingPct), netPct: pct(p.netPct),
        });
        summary.trend = "cierra";
      } else summary.trend = "sin cambio";
    });

    // 3b. CARRY.
    const spot = await client.spotPrices();
    const spotSymbols = new Set(spot.keys());
    const openCarry = await store.listOpen(CARRY_STRATEGY);
    const symbols = [...new Set([...openCarry.map((o) => o.symbol), ...top.map((t) => t.symbol)])];
    const info = new Map<string, { signal: number; rates: { time: number; rate: number }[]; perp: number; spot: number | null }>();
    await mapLimit(symbols, async (s) => {
      const data = await safe(`CARRY ${s}`, async () => {
        const rates = await client.fundingRates(s, now - 30 * DAY_MS);
        const map = spotFor(s, spotSymbols);
        const spotPx = map ? spot.get(map.spot)! * map.factor : null;
        return { signal: carrySignal(rates, dayStart), rates, perp: await client.perpPrice(s), spot: spotPx };
      });
      if (data) info.set(s, data);
    });
    const decision = decideCarry(
      top.filter((t) => info.get(t.symbol)?.spot != null).map((t) => ({ symbol: t.symbol, rank: t.rank, signal: info.get(t.symbol)!.signal })),
      openCarry.map((o) => ({ symbol: o.symbol, signal: info.get(o.symbol)?.signal ?? NaN }))
    );
    for (const row of openCarry.filter((o) => decision.exit.includes(o.symbol))) {
      const d = info.get(row.symbol);
      if (!d || d.spot == null) continue; // sin precio hoy: se reintenta en la próxima corrida diaria
      const entryTime = row.entryTime.getTime();
      const funding = d.rates.filter((f) => f.time > entryTime && f.time <= dayStart).map((f) => f.rate);
      const p = carryPnl(row.rank, Number(row.entryPrice), d.perp, Number(row.spotEntryPrice), d.spot, funding);
      await store.close(row.id!, {
        status: "cerrada", exitTime: new Date(now), exitPrice: String(d.perp), spotExitPrice: String(d.spot), exitReason: "signal",
        grossPct: pct(p.grossPct), costPct: pct(p.costPct), fundingPct: pct(p.fundingPct), netPct: pct(p.netPct),
      });
      summary.carryClosed++;
    }
    const carryRow = (c: (typeof decision.enter)[number], status: ShadowRow["status"]): ShadowRow => {
      const d = info.get(c.symbol)!;
      return {
        strategy: CARRY_STRATEGY, symbol: c.symbol, side: "short", rank: c.rank, status,
        signalTime: new Date(dayStart), signalValue: c.signal.toFixed(4), entryTime: new Date(now),
        entryPrice: String(d.perp), spotEntryPrice: String(d.spot),
      };
    };
    await store.insert([...decision.enter.map((c) => carryRow(c, "abierta")), ...decision.noSlot.map((c) => carryRow(c, "sin_cupo"))]);
    summary.carryOpened = decision.enter.length;
  }

  return summary;
}
