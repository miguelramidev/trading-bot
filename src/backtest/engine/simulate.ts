// Simulador de cartera: una sola cuenta compartida, recorrida hora por hora.
//
// Orden de cada hora H (todas las horas son límites de vela de 1h):
//   1. Funding: cada posición abierta en H paga/cobra los eventos de funding de esa hora.
//   2. Si H es cierre de vela del TF de señal (4h/1d):
//      a. Posiciones abiertas: salida por señal, corte por tiempo y stop gestionado por el bot,
//         evaluados con la vela que acaba de cerrar; las salidas se ejecutan al open de H.
//      b. Entradas: señales de los instrumentos del universo point-in-time vigente en H, por
//         prioridad (score, luego rank de volumen), mientras haya cupo y margen. Fill al open de H.
//   3. Salidas intravela (stop duro, TP, trailing nativo) con la vela de 1h que abre en H.
//   4. Al cerrar el día UTC, se registra la equity mark-to-market.
//
// Margen fijo por operación (como `montoOperacion` del bot, sin interés compuesto): los
// resultados en % se leen contra `initialEquity`.
import { processBar, initExitState, liquidationPrice, type ExitState } from "./exits.js";
import type { InstrumentData, MarketData, SimConfig, SimResult, Strategy, Trade, DailyEquity, TradeExitReason, PositionView } from "./types.js";
import { universeAt, type UniverseSnapshot } from "../universe.js";
import { HOUR_MS, DAY_MS } from "../data/candles.js";

interface Position {
  inst: InstrumentData;
  prepared: unknown;
  rank: number;
  entryTime: number;
  entryPrice: number;
  entryTfIndex: number;
  initialStop: number;
  qty: number;
  leverage: number;
  margin: number;
  fees: number;
  funding: number;
  exit: ExitState;
  ambiguous: boolean;
  /** Puntero a la vela de 1h actual y al próximo evento de funding. */
  h1Index: number;
  fundingIndex: number;
  lastClose: number;
  barsHeld: number;
}

/** Índice de la vela con openTime === t, o −1. */
function indexAt(openTimes: Float64Array, t: number): number {
  let lo = 0;
  let hi = openTimes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = openTimes[mid];
    if (v === t) return mid;
    if (v < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Primer índice con valor ≥ t. */
function lowerBound(values: Float64Array, t: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Apalancamiento según RULES.md Regla 1, mismo algoritmo que Trader.executeTrade: arranca en
 * leverageMin y sube de a 1 hasta leverageMax mientras margen × apalancamiento < max(piso, minNotional).
 * `null` si ni con leverageMax alcanza (executeTrade rechaza la orden).
 */
export function regla1Leverage(margin: number, minNotional: number, cfg: Pick<SimConfig, "leverageMin" | "leverageMax" | "notionalFloor">): number | null {
  const target = Math.max(cfg.notionalFloor, minNotional);
  let leverage = cfg.leverageMin;
  while (margin * leverage < target && leverage < cfg.leverageMax) leverage++;
  return margin * leverage >= target ? leverage : null;
}

function slippageBps(cfg: SimConfig, rank: number): number {
  const tier = cfg.slippageTiers.find((t) => rank <= t.maxRank) ?? cfg.slippageTiers[cfg.slippageTiers.length - 1];
  return (tier.bps / 10_000) * cfg.costMultiplier;
}

export function simulate(
  strategy: Strategy<any>,
  instruments: Map<string, InstrumentData>,
  market: MarketData,
  universe: UniverseSnapshot[],
  cfg: SimConfig
): SimResult {
  const tfMs = strategy.timeframeHours * HOUR_MS;
  const fee = cfg.feeRate * cfg.costMultiplier;
  const sideSign = strategy.side === "long" ? 1 : -1;

  const prepared = new Map<string, unknown>();
  const getPrepared = (inst: InstrumentData) => {
    let p = prepared.get(inst.id);
    if (p === undefined) {
      p = strategy.prepare(inst, market);
      prepared.set(inst.id, p);
    }
    return p;
  };

  const open = new Map<string, Position>();
  const trades: Trade[] = [];
  const equity: DailyEquity[] = [];
  let realized = 0;
  let skippedNoSlot = 0;
  let skippedNoMargin = 0;
  let skippedMinNotional = 0;

  const view = (pos: Position): PositionView => ({
    side: strategy.side,
    entryPrice: pos.entryPrice,
    entryTfIndex: pos.entryTfIndex,
    stop: pos.exit.stop,
    barsHeld: pos.barsHeld,
  });

  const close = (pos: Position, rawPrice: number, time: number, reason: TradeExitReason, ambiguous = false) => {
    const isStopLike = reason === "stop" || reason === "trailing";
    let slip = slippageBps(cfg, pos.rank) * (isStopLike ? cfg.stopSlippageMult : 1);
    if (reason === "end") slip = 0;
    if (reason === "liquidation") slip = 0;
    let price = rawPrice * (1 - sideSign * slip);
    if (reason === "delisted") price = rawPrice * (1 - sideSign * cfg.delistPenalty);
    // Liquidación en aislado: se pierde todo el margen de la posición (lo que sobre lo absorbe
    // el fondo de seguro), sin comisión de salida a cargo del usuario.
    const liquidated = reason === "liquidation";
    const exitFee = liquidated ? 0 : pos.qty * price * fee;
    const gross = liquidated ? -pos.margin : sideSign * pos.qty * (price - pos.entryPrice);
    const fees = pos.fees + exitFee;
    const net = gross - fees + pos.funding;
    const risk = pos.qty * Math.abs(pos.entryPrice - pos.initialStop);
    realized += net;
    trades.push({
      strategyId: strategy.id,
      instrument: pos.inst.id,
      side: strategy.side,
      rankAtEntry: pos.rank,
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      initialStop: pos.initialStop,
      exitTime: time,
      exitPrice: price,
      exitReason: reason,
      ambiguous: ambiguous || pos.ambiguous,
      qty: pos.qty,
      leverage: pos.leverage,
      notional: pos.qty * pos.entryPrice,
      grossPnl: gross,
      fees,
      funding: pos.funding,
      netPnl: net,
      rMultiple: risk > 0 ? net / risk : 0,
      barsHeld: pos.barsHeld,
    });
    open.delete(pos.inst.id);
  };

  const markToMarket = () => {
    let unrealized = 0;
    for (const pos of open.values()) unrealized += sideSign * pos.qty * (pos.lastClose - pos.entryPrice) + pos.funding - pos.fees;
    return cfg.initialEquity + realized + unrealized;
  };

  const usedMargin = () => [...open.values()].reduce((s, p) => s + p.margin, 0);

  const startH = Math.ceil(cfg.start / HOUR_MS) * HOUR_MS;
  for (let H = startH; H < cfg.end; H += HOUR_MS) {
    // 4. Equity del día que acaba de cerrar (antes de tocar nada de la hora H).
    if (H % DAY_MS === 0 && H > startH) {
      equity.push({ date: H - DAY_MS, equity: markToMarket(), openPositions: open.size });
    }

    // Instrumentos que dejaron de cotizar con la posición abierta.
    for (const pos of [...open.values()]) {
      const h1 = pos.inst.h1;
      if (h1.openTime[h1.length - 1] < H) close(pos, pos.lastClose, H, "delisted");
    }

    // 1. Funding de esta hora.
    for (const pos of open.values()) {
      const f = pos.inst.funding;
      while (pos.fundingIndex < f.time.length && f.time[pos.fundingIndex] <= H) {
        const t = f.time[pos.fundingIndex];
        if (t === H && t > pos.entryTime) {
          // Los longs pagan funding positivo; los shorts lo cobran. Notional al precio actual (≈ mark).
          pos.funding -= sideSign * pos.qty * pos.lastClose * f.rate[pos.fundingIndex];
        }
        pos.fundingIndex++;
      }
    }

    // 2. Cierre de vela del TF de señal.
    if (H % tfMs === 0) {
      const closedBarOpen = H - tfMs;

      // 2a. Gestión de posiciones abiertas con la vela que acaba de cerrar.
      for (const pos of [...open.values()]) {
        const i = indexAt(pos.inst.tf.openTime, closedBarOpen);
        if (i < 0) continue;
        pos.barsHeld++;
        const p = pos.prepared;
        const v = view(pos);
        let exitNow = false;
        let reason: TradeExitReason = "signal";
        if (strategy.exitSignal?.(p, i, v)) exitNow = true;
        else if (strategy.maxBars !== undefined && pos.barsHeld >= strategy.maxBars) {
          exitNow = true;
          reason = "time";
        }
        if (exitNow) {
          const j = indexAt(pos.inst.h1.openTime, H);
          if (j >= 0) close(pos, pos.inst.h1.open[j], H, reason);
          continue;
        }
        const newStop = strategy.updateStop?.(p, i, v);
        if (newStop !== undefined && sideSign * newStop > sideSign * pos.exit.stop) pos.exit.stop = newStop;
      }

      // 2b. Entradas.
      const snap = universeAt(universe, H);
      if (snap) {
        // Filtro cross-sectional: top K del universo vigente por el score de la estrategia,
        // calculado sobre TODO el universo (incluidas las monedas con posición abierta).
        let allowed: Set<string> | null = null;
        if (strategy.crossSectionalScore && strategy.crossSectionalTopK) {
          const scored: { id: string; score: number }[] = [];
          for (const id of snap.ranked) {
            const inst = instruments.get(id);
            if (!inst) continue;
            const i = indexAt(inst.tf.openTime, closedBarOpen);
            if (i < 0) continue;
            const score = strategy.crossSectionalScore(getPrepared(inst), i);
            if (Number.isFinite(score)) scored.push({ id, score });
          }
          scored.sort((a, b) => b.score - a.score);
          allowed = new Set(scored.slice(0, strategy.crossSectionalTopK).map((x) => x.id));
        }

        const candidates: { inst: InstrumentData; i: number; score: number; rank: number }[] = [];
        snap.ranked.forEach((id, k) => {
          if (open.has(id)) return;
          if (strategy.maxRank !== undefined && k + 1 > strategy.maxRank) return;
          if (allowed && !allowed.has(id)) return;
          const inst = instruments.get(id);
          if (!inst) return;
          const i = indexAt(inst.tf.openTime, closedBarOpen);
          if (i < 0) return;
          const sig = strategy.entry(getPrepared(inst), i);
          if (sig) candidates.push({ inst, i, score: sig.score, rank: k + 1 });
        });
        candidates.sort((a, b) => b.score - a.score || a.rank - b.rank);

        for (const c of candidates) {
          if (open.size >= cfg.maxPositions) {
            skippedNoSlot++;
            continue;
          }
          const leverage = regla1Leverage(cfg.marginPerTrade, c.inst.minNotional, cfg);
          if (leverage === null) {
            skippedMinNotional++;
            continue;
          }
          // Regla 2: el margen libre tiene que cubrir el margen configurado (nunca se achica la orden).
          const equityNow = markToMarket();
          if (usedMargin() + cfg.marginPerTrade > equityNow) {
            skippedNoMargin++;
            continue;
          }
          const j = indexAt(c.inst.h1.openTime, H);
          if (j < 0) continue;
          const slip = slippageBps(cfg, c.rank);
          const entryPrice = c.inst.h1.open[j] * (1 + sideSign * slip);
          const p = getPrepared(c.inst);
          const plan = strategy.plan(p, c.i, entryPrice);
          // Un plan sin distancia de stop válida no se opera (equivale a un rechazo de executeTrade).
          if (!(sideSign * (entryPrice - plan.stop) > 0)) continue;
          const qty = (cfg.marginPerTrade * leverage) / entryPrice;
          open.set(c.inst.id, {
            inst: c.inst,
            prepared: p,
            rank: c.rank,
            entryTime: H,
            entryPrice,
            entryTfIndex: c.i,
            initialStop: plan.stop,
            qty,
            leverage,
            margin: cfg.marginPerTrade,
            fees: qty * entryPrice * fee,
            funding: 0,
            exit: initExitState(
              strategy.side,
              entryPrice,
              plan.stop,
              plan.takeProfit,
              plan.trailing,
              liquidationPrice(strategy.side, entryPrice, leverage, cfg.maintenanceMarginRate)
            ),
            ambiguous: false,
            h1Index: j,
            fundingIndex: lowerBound(c.inst.funding.time, H + 1),
            lastClose: c.inst.h1.open[j],
            barsHeld: 0,
          });
        }
      }
    }

    // 3. Salidas intravela con la vela de 1h que abre en H.
    for (const pos of [...open.values()]) {
      const h1 = pos.inst.h1;
      while (pos.h1Index < h1.length && h1.openTime[pos.h1Index] < H) pos.h1Index++;
      if (pos.h1Index >= h1.length || h1.openTime[pos.h1Index] !== H) continue; // hueco: sin vela esta hora
      const j = pos.h1Index;
      const fill = processBar(pos.exit, { open: h1.open[j], high: h1.high[j], low: h1.low[j], close: h1.close[j] });
      pos.lastClose = h1.close[j];
      if (fill) close(pos, fill.price, H + HOUR_MS, fill.reason, fill.ambiguous);
    }
  }

  // Fin del período: se cierra todo al último cierre conocido, sin slippage (es contable, no real).
  for (const pos of [...open.values()]) close(pos, pos.lastClose, cfg.end, "end");
  equity.push({ date: Math.floor((cfg.end - 1) / DAY_MS) * DAY_MS, equity: markToMarket(), openPositions: 0 });

  return { config: cfg, strategyId: strategy.id, trades, equity, skippedNoSlot, skippedNoMargin, skippedMinNotional };
}
