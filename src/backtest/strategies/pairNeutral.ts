// POS neutral al mercado (pre-registrada en docs/investigacion/2026-10-07-pos-neutral.md): corto en
// la moneda con largos saturados (zLS > 2) + largo en ETH por el mismo nocional, para quedarse
// solo con el efecto relativo que mostró la verificación por deciles.
//
// Simulador propio (dos patas), hora por hora:
//   - Señal al cierre de cada vela de 4h (misma zLS que POS); entrada al open de la hora siguiente.
//   - Una posición (un par) a la vez; prioridad: mayor zLS, después mejor rank.
//   - Salida a las 72 h al open; stop del par evaluado al cierre de cada hora (pérdida del par
//     ≥ 2,5 × ATR%(4h) de la moneda al entrar), ejecutado al open siguiente; liquidación de cada
//     pata con el high/low de la vela de 1h.
//   - Margen: 25 % del saldo, mitad por pata; apalancamiento por la Regla 1, el mismo para las dos.
import { HOUR_MS, DAY_MS } from "../data/candles.js";
import { universeAt, type UniverseSnapshot } from "../universe.js";
import { regla1Leverage } from "../engine/simulate.js";
import { liquidationPrice } from "../engine/exits.js";
import { positioningStrategy, POS_THRESHOLD, POS_STOP_ATR, type PositioningPrepared } from "./positioning.js";
import type { CustomStrategy, DailyEquity, InstrumentData, SimConfig, SimResult, Trade } from "../engine/types.js";
import { loadUniverse, loadMarket } from "../context.js";

export const HEDGE_SYMBOL = "ETHUSDT";
export const PAIR_HOLD_MS = 72 * HOUR_MS;
const TF_MS = 4 * HOUR_MS;

export interface PairParams {
  /** Rango de ranks del universo en el que se buscan señales (inclusive). */
  rankFrom: number;
  rankTo: number;
  /** Fracción del saldo que se usa como margen total del par (la mitad por pata). */
  fraction: number;
}

/** Índice de la vela con openTime === t, o −1. */
function indexAt(openTimes: Float64Array, t: number): number {
  let lo = 0, hi = openTimes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (openTimes[mid] === t) return mid;
    if (openTimes[mid] < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

interface Leg {
  inst: InstrumentData;
  sign: number; // +1 largo, −1 corto
  qty: number;
  entry: number;
  margin: number;
  liq: number;
  fundingIdx: number;
  funding: number;
  last: number;
  rank: number;
}

interface Pair {
  coin: Leg;
  hedge: Leg;
  entryTime: number;
  stopPct: number;
  fees: number;
  leverage: number;
  pendingStop: boolean;
}

export function simulatePairs(
  id: string,
  params: PairParams,
  instruments: Map<string, InstrumentData>,
  universe: UniverseSnapshot[],
  cfg: SimConfig
): SimResult {
  const hedge = [...instruments.values()].find((i) => i.symbol === HEDGE_SYMBOL && i.id === HEDGE_SYMBOL);
  if (!hedge) throw new Error("Falta ETHUSDT en los instrumentos cargados");
  const fee = cfg.feeRate * cfg.costMultiplier;
  const slip = (rank: number) => {
    const t = cfg.slippageTiers.find((x) => rank <= x.maxRank) ?? cfg.slippageTiers[cfg.slippageTiers.length - 1];
    return (t.bps / 10_000) * cfg.costMultiplier;
  };
  const pos = positioningStrategy({ measure: "ls", holdBars: 18 });
  const prepared = new Map<string, PositioningPrepared>();
  const prep = (inst: InstrumentData) => {
    let p = prepared.get(inst.id);
    if (!p) prepared.set(inst.id, (p = pos.prepare(inst, { btcDaily: hedge.daily })));
    return p;
  };

  let realized = 0;
  let open: Pair | null = null;
  const trades: Trade[] = [];
  const equity: DailyEquity[] = [];
  let skippedMinNotional = 0;

  const legPnl = (l: Leg, px: number) => l.sign * l.qty * (px - l.entry) + l.funding;
  const markToMarket = () => cfg.initialEquity + realized + (open ? legPnl(open.coin, open.coin.last) + legPnl(open.hedge, open.hedge.last) - open.fees : 0);

  const closePair = (p: Pair, coinPx: number, hedgePx: number, time: number, reason: Trade["exitReason"], mult = 1, liquidated?: "coin" | "hedge") => {
    const exitFill = (l: Leg, px: number) => px * (1 - l.sign * slip(l.rank) * mult);
    const cx = exitFill(p.coin, coinPx);
    const hx = exitFill(p.hedge, hedgePx);
    // Pata liquidada: pierde su margen entero y no paga comisión de salida.
    const coinGross = liquidated === "coin" ? -p.coin.margin : p.coin.sign * p.coin.qty * (cx - p.coin.entry);
    const hedgeGross = liquidated === "hedge" ? -p.hedge.margin : p.hedge.sign * p.hedge.qty * (hx - p.hedge.entry);
    const exitFees = (liquidated === "coin" ? 0 : p.coin.qty * cx * fee) + (liquidated === "hedge" ? 0 : p.hedge.qty * hx * fee);
    const gross = coinGross + hedgeGross;
    const funding = p.coin.funding + p.hedge.funding;
    const fees = p.fees + exitFees;
    const net = gross - fees + funding;
    realized += net;
    const notional = p.coin.qty * p.coin.entry;
    trades.push({
      strategyId: id, instrument: p.coin.inst.id, side: "short", rankAtEntry: p.coin.rank, entryTime: p.entryTime,
      entryPrice: p.coin.entry, initialStop: p.coin.entry * (1 + p.stopPct), exitTime: time, exitPrice: cx, exitReason: reason,
      ambiguous: false, qty: p.coin.qty, leverage: p.leverage, notional, grossPnl: gross, fees, funding, netPnl: net,
      rMultiple: net / (notional * p.stopPct), barsHeld: Math.round((time - p.entryTime) / TF_MS),
    });
    open = null;
  };

  const startH = Math.ceil(cfg.start / HOUR_MS) * HOUR_MS;
  for (let H = startH; H < cfg.end; H += HOUR_MS) {
    if (H % DAY_MS === 0 && H > startH) equity.push({ date: H - DAY_MS, equity: markToMarket(), openPositions: open ? 1 : 0 });

    if (open) {
      const p: Pair = open;
      const jc = indexAt(p.coin.inst.h1.openTime, H);
      const jh = indexAt(p.hedge.inst.h1.openTime, H);
      if (jc < 0 || jh < 0) {
        // Sin vela esta hora: si la moneda dejó de cotizar, se cierra con penalización.
        if (p.coin.inst.h1.openTime[p.coin.inst.h1.length - 1] < H) closePair(p, p.coin.last * (1 + cfg.delistPenalty), p.hedge.last, H, "delisted");
      } else {
        // Funding de esta hora.
        for (const l of [p.coin, p.hedge]) {
          const f = l.inst.funding;
          while (l.fundingIdx < f.time.length && f.time[l.fundingIdx] <= H) {
            if (f.time[l.fundingIdx] === H && H > p.entryTime) l.funding -= l.sign * l.qty * l.last * f.rate[l.fundingIdx];
            l.fundingIdx++;
          }
        }
        const c = p.coin.inst.h1, h = p.hedge.inst.h1;
        if (H >= p.entryTime + PAIR_HOLD_MS) closePair(p, c.open[jc], h.open[jh], H, "time");
        else if (p.pendingStop) closePair(p, c.open[jc], h.open[jh], H, "stop", cfg.stopSlippageMult);
        else if (c.high[jc] >= p.coin.liq) closePair(p, p.coin.liq, h.close[jh], H + HOUR_MS, "liquidation", 1, "coin");
        else if (h.low[jh] <= p.hedge.liq) closePair(p, c.close[jc], p.hedge.liq, H + HOUR_MS, "liquidation", 1, "hedge");
        else {
          p.coin.last = c.close[jc];
          p.hedge.last = h.close[jh];
          const pairRet = -(p.coin.last / p.coin.entry - 1) + (p.hedge.last / p.hedge.entry - 1);
          if (pairRet <= -p.stopPct) p.pendingStop = true;
        }
      }
    }

    // Señales al cierre de cada vela de 4h.
    if (H % TF_MS === 0 && !open) {
      const snap = universeAt(universe, H);
      if (snap) {
        const cands: { inst: InstrumentData; i: number; z: number; rank: number }[] = [];
        snap.ranked.forEach((instId, k) => {
          const rank = k + 1;
          if (rank < params.rankFrom || rank > params.rankTo) return;
          const inst = instruments.get(instId);
          if (!inst || inst.symbol === HEDGE_SYMBOL || inst.symbol === "BTCUSDT") return;
          const i = indexAt(inst.tf.openTime, H - TF_MS);
          if (i < 0) return;
          const p = prep(inst);
          if (p.c[i] > POS_THRESHOLD.ls && p.atr14[i] > 0) cands.push({ inst, i, z: p.c[i], rank });
        });
        cands.sort((a, b) => b.z - a.z || a.rank - b.rank);
        const hedgeRank = (snap.ranked.indexOf(HEDGE_SYMBOL) + 1) || 1;
        for (const cand of cands) {
          const jc = indexAt(cand.inst.h1.openTime, H);
          const jh = indexAt(hedge.h1.openTime, H);
          if (jc < 0 || jh < 0) continue;
          const eq = markToMarket();
          const legMargin = (params.fraction * eq) / 2;
          // Mismo apalancamiento para las dos patas: el que exija la de mayor nocional mínimo.
          const lc = regla1Leverage(legMargin, cand.inst.minNotional, cfg);
          const lh = regla1Leverage(legMargin, hedge.minNotional, cfg);
          if (lh === null) {
            // Ni con leverageMax la pata de ETH llega a su mínimo: ninguna candidata puede entrar.
            skippedMinNotional++;
            break;
          }
          if (lc === null) {
            skippedMinNotional++;
            continue;
          }
          const leverage = Math.max(lc, lh);
          const notional = legMargin * leverage;
          const coinEntry = cand.inst.h1.open[jc] * (1 - slip(cand.rank));
          const hedgeEntry = hedge.h1.open[jh] * (1 + slip(hedgeRank));
          const stopPct = (POS_STOP_ATR * prep(cand.inst).atr14[cand.i]) / cand.inst.h1.open[jc];
          const mk = (inst: InstrumentData, sign: number, entry: number, rank: number): Leg => ({
            inst, sign, qty: notional / entry, entry, margin: legMargin, rank, funding: 0, last: entry,
            liq: liquidationPrice(sign === 1 ? "long" : "short", entry, leverage, cfg.maintenanceMarginRate),
            fundingIdx: (() => { let k = 0; while (k < inst.funding.time.length && inst.funding.time[k] <= H) k++; return k; })(),
          });
          open = {
            coin: mk(cand.inst, -1, coinEntry, cand.rank),
            hedge: mk(hedge, 1, hedgeEntry, hedgeRank),
            entryTime: H, stopPct, leverage, pendingStop: false,
            fees: 2 * notional * fee,
          };
          break;
        }
      }
    }
  }

  if (open) {
    const p: Pair = open;
    closePair(p, p.coin.last, p.hedge.last, cfg.end, "end", 0);
  }
  equity.push({ date: Math.floor((cfg.end - 1) / DAY_MS) * DAY_MS, equity: markToMarket(), openPositions: 0 });
  return { config: cfg, strategyId: id, trades, equity, skippedNoSlot: 0, skippedNoMargin: 0, skippedMinNotional, skippedFiltered: 0 };
}

/** Estrategia para run.ts / validate.ts: carga el top 100 con métricas en 4h y corre simulatePairs. */
export function pairNeutralStrategy(params: PairParams): CustomStrategy {
  const id = `POSN_r${params.rankFrom}-${params.rankTo}_f${Math.round(params.fraction * 100)}`;
  let cache: { key: string; instruments: Map<string, InstrumentData>; universe: UniverseSnapshot[] } | null = null;
  return {
    id,
    family: "reversion",
    timeframeHours: 4,
    run(cfg: SimConfig): SimResult {
      const key = `${cfg.start}-${cfg.end}`;
      if (!cache || cache.key !== key) {
        const universe = loadUniverse();
        const { instruments } = loadMarket(universe, 4, cfg.start, cfg.end, { metrics: true });
        cache = { key, instruments, universe };
      }
      return simulatePairs(id, params, cache.instruments, cache.universe, cfg);
    },
  };
}
