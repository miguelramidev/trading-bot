// CARRY · carry de funding: spot comprado + perpetuo vendido por el mismo tamaño (pre-registrado
// en docs/investigacion/2026-10-06-tres-lineas.md). No predice el precio: cobra el funding que
// pagan los largos apalancados, solo mientras paga bien.
//
//   Señal (00:00 UTC): funding acumulado de los últimos 7 días × 365/7 (anualizado).
//   Entrada: señal > T_in → compra spot y vende perpetuo al open diario de cada mercado.
//   Salida: señal < T_in / 3 (o se corta el dato) → cierra las dos patas al open diario.
//   Tamaño: 50 USDT de nocional por posición (100 de capital: spot + margen x1); máximo 3.
//   PnL: funding cobrado por la pata corta + variación de la base − costos de las 4 operaciones.
//   Liquidación de la pata corta (x1): si el máximo diario del perpetuo llega a entrada × 1,99,
//     se cierran las dos patas a ese precio con una penalización del 1 % del nocional.
//
// Simulador propio (dos patas, diario): devuelve un SimResult para que computeMetrics y
// validate.ts lo traten como a las demás estrategias.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DAY_MS, parseKlinesCsv } from "../data/candles.js";
import { extractSingleFile } from "../data/zip.js";
import { loadInstrumentData } from "../data/load.js";
import { SPOT_DIR, SPOT_MAP_PATH, UNIVERSE_PATH } from "../data/paths.js";
import { universeAt, type UniverseSnapshot } from "../universe.js";
import type { CustomStrategy, DailyEquity, SimConfig, SimResult, Trade } from "../engine/types.js";

export const CARRY_NOTIONAL = 50;
export const CARRY_CAPITAL_PER_POSITION = 2 * CARRY_NOTIONAL;
export const CARRY_MAX_POSITIONS = 3;
export const SPOT_FEE_RATE = 0.001;
export const LIQUIDATION_PENALTY = 0.01;
/** Liquidación aproximada de un corto a x1 con 1 % de mantenimiento: entrada × (1 + 1 − 0,01). */
export const SHORT_X1_LIQUIDATION = 1.99;
const LOOKBACK_DAYS = 7;

export interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Datos de un par para el carry, por día (openTime 00:00 UTC). El spot ya viene en la escala del perpetuo. */
export interface CarryInstrument {
  symbol: string;
  perp: Map<number, Ohlc>;
  spot: Map<number, Ohlc>;
  fundingTime: Float64Array;
  fundingRate: Float64Array;
}

export interface CarryParams {
  /** Umbral de entrada, anualizado (0,15 = 15 %). */
  tIn: number;
  universe: "btc_eth" | "top30";
}

/** Funding acumulado en [t − 7 días, t), anualizado. NaN si no hubo ningún evento en la ventana. */
export function trailingFundingAnnualized(time: Float64Array, rate: Float64Array, t: number): number {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < time.length; k++) {
    if (time[k] >= t) break;
    if (time[k] >= t - LOOKBACK_DAYS * DAY_MS) {
      sum += rate[k];
      n++;
    }
  }
  return n > 0 ? (sum * 365) / LOOKBACK_DAYS : NaN;
}

interface Position {
  inst: CarryInstrument;
  rank: number;
  entryDay: number;
  qty: number;
  perpEntry: number;
  spotEntry: number;
  fees: number;
  funding: number;
  fundingIndex: number;
  lastPerp: number;
  lastSpot: number;
}

/**
 * Núcleo puro del carry. `candidatesAt(day)` devuelve los símbolos elegibles ese día con su rank
 * de volumen (BTC/ETH, o el top 30 vigente).
 */
export function simulateCarry(
  id: string,
  params: CarryParams,
  instruments: Map<string, CarryInstrument>,
  candidatesAt: (day: number) => { symbol: string; rank: number }[],
  cfg: SimConfig
): SimResult {
  const tOut = params.tIn / 3;
  const perpFee = cfg.feeRate * cfg.costMultiplier;
  const spotFee = SPOT_FEE_RATE * cfg.costMultiplier;
  const slip = (rank: number) => {
    const tier = cfg.slippageTiers.find((t) => rank <= t.maxRank) ?? cfg.slippageTiers[cfg.slippageTiers.length - 1];
    return (tier.bps / 10_000) * cfg.costMultiplier;
  };

  const open = new Map<string, Position>();
  const trades: Trade[] = [];
  const equity: DailyEquity[] = [];
  let realized = 0;
  let skippedNoSlot = 0;
  let skippedNoMargin = 0;

  const unrealized = (p: Position) => p.qty * (p.lastSpot - p.spotEntry) - p.qty * (p.lastPerp - p.perpEntry) + p.funding - p.fees;
  const markToMarket = () => cfg.initialEquity + realized + [...open.values()].reduce((s, p) => s + unrealized(p), 0);

  const close = (p: Position, perpPx: number, spotPx: number, day: number, reason: Trade["exitReason"], penalty = 0) => {
    const s = slip(p.rank);
    // Cerrar: vender spot (recibe menos) y recomprar perpetuo (paga más).
    const spotExit = spotPx * (1 - s);
    const perpExit = perpPx * (1 + s);
    const exitFees = p.qty * spotExit * spotFee + p.qty * perpExit * perpFee + penalty;
    const gross = p.qty * (spotExit - p.spotEntry) - p.qty * (perpExit - p.perpEntry);
    const fees = p.fees + exitFees;
    const net = gross - fees + p.funding;
    realized += net;
    trades.push({
      strategyId: id,
      instrument: p.inst.symbol,
      side: "short",
      rankAtEntry: p.rank,
      entryTime: p.entryDay,
      entryPrice: p.perpEntry,
      initialStop: p.perpEntry,
      exitTime: day,
      exitPrice: perpExit,
      exitReason: reason,
      ambiguous: false,
      qty: p.qty,
      leverage: 1,
      notional: p.qty * p.perpEntry,
      grossPnl: gross,
      fees,
      funding: p.funding,
      netPnl: net,
      rMultiple: 0,
      barsHeld: Math.round((day - p.entryDay) / DAY_MS),
    });
    open.delete(p.inst.symbol);
  };

  const startDay = Math.ceil(cfg.start / DAY_MS) * DAY_MS;
  for (let day = startDay; day < cfg.end; day += DAY_MS) {
    const prev = day - DAY_MS;

    // 1. Lo que pasó durante el día anterior: funding cobrado, liquidación y precios de cierre.
    for (const p of [...open.values()]) {
      const perpBar = p.inst.perp.get(prev);
      const spotBar = p.inst.spot.get(prev);
      if (prev >= p.entryDay) {
        while (p.fundingIndex < p.inst.fundingTime.length && p.inst.fundingTime[p.fundingIndex] < day) {
          // La pata corta cobra el funding positivo (y paga el negativo) sobre el nocional actual.
          p.funding += p.inst.fundingRate[p.fundingIndex] * p.qty * (perpBar?.open ?? p.lastPerp);
          p.fundingIndex++;
        }
      }
      if (perpBar && perpBar.high >= p.perpEntry * SHORT_X1_LIQUIDATION) {
        const liq = p.perpEntry * SHORT_X1_LIQUIDATION;
        // La base no se mueve en un spike: el spot sube en la misma proporción que el perpetuo.
        close(p, liq, liq * (p.spotEntry / p.perpEntry), day, "liquidation", LIQUIDATION_PENALTY * p.qty * p.perpEntry);
        continue;
      }
      if (perpBar) p.lastPerp = perpBar.close;
      if (spotBar) p.lastSpot = spotBar.close;
    }
    if (day > startDay) equity.push({ date: prev, equity: markToMarket(), openPositions: open.size });

    // 2. Salidas: el funding dejó de pagar, o se cortó el dato de alguno de los dos mercados.
    for (const p of [...open.values()]) {
      const perpBar = p.inst.perp.get(day);
      const spotBar = p.inst.spot.get(day);
      if (!perpBar || !spotBar) {
        close(p, p.lastPerp, p.lastSpot, day, "delisted");
        continue;
      }
      const signal = trailingFundingAnnualized(p.inst.fundingTime, p.inst.fundingRate, day);
      if (!(signal >= tOut)) close(p, perpBar.open, spotBar.open, day, "signal");
    }

    // 3. Entradas.
    const scored: { inst: CarryInstrument; rank: number; signal: number }[] = [];
    for (const c of candidatesAt(day)) {
      if (open.has(c.symbol)) continue;
      const inst = instruments.get(c.symbol);
      if (!inst || !inst.perp.get(day) || !inst.spot.get(day)) continue;
      const signal = trailingFundingAnnualized(inst.fundingTime, inst.fundingRate, day);
      if (signal > params.tIn) scored.push({ inst, rank: c.rank, signal });
    }
    scored.sort((a, b) => b.signal - a.signal || a.rank - b.rank);
    for (const c of scored) {
      if (open.size >= CARRY_MAX_POSITIONS) {
        skippedNoSlot++;
        continue;
      }
      if (CARRY_CAPITAL_PER_POSITION * (open.size + 1) > markToMarket()) {
        skippedNoMargin++;
        continue;
      }
      const s = slip(c.rank);
      const perpOpen = c.inst.perp.get(day)!.open;
      const spotOpen = c.inst.spot.get(day)!.open;
      const perpEntry = perpOpen * (1 - s); // vende
      const spotEntry = spotOpen * (1 + s); // compra
      const qty = CARRY_NOTIONAL / perpEntry;
      // El evento de funding de las 00:00 en que se entra no se cobra (lo conservador: en la
      // práctica la orden llega después de la liquidación).
      let fundingIndex = 0;
      while (fundingIndex < c.inst.fundingTime.length && c.inst.fundingTime[fundingIndex] <= day) fundingIndex++;
      open.set(c.inst.symbol, {
        inst: c.inst,
        rank: c.rank,
        entryDay: day,
        qty,
        perpEntry,
        spotEntry,
        fees: qty * spotEntry * spotFee + qty * perpEntry * perpFee,
        funding: 0,
        fundingIndex,
        lastPerp: perpOpen,
        lastSpot: spotOpen,
      });
    }
  }

  for (const p of [...open.values()]) close(p, p.lastPerp, p.lastSpot, cfg.end, "end");
  equity.push({ date: Math.floor((cfg.end - 1) / DAY_MS) * DAY_MS, equity: markToMarket(), openPositions: 0 });

  return { config: cfg, strategyId: id, trades, equity, skippedNoSlot, skippedNoMargin, skippedMinNotional: 0, skippedFiltered: 0 };
}

// --- Carga de datos reales (data_dl/) ---

let cache: { instruments: Map<string, CarryInstrument>; universe: UniverseSnapshot[] } | null = null;

function toDailyMap(candles: { openTime: number; open: number; high: number; low: number; close: number }[], factor = 1): Map<number, Ohlc> {
  return new Map(candles.map((c) => [c.openTime, { open: c.open * factor, high: c.high * factor, low: c.low * factor, close: c.close * factor }]));
}

function loadCarryData() {
  if (cache) return cache;
  if (!existsSync(SPOT_MAP_PATH)) throw new Error("Falta spot_map.json: correr downloadExtra.ts --dataset=spot");
  const spotMap: Record<string, { spot: string; factor: number }> = JSON.parse(readFileSync(SPOT_MAP_PATH, "utf8"));
  const instruments = new Map<string, CarryInstrument>();
  for (const [symbol, { factor }] of Object.entries(spotMap)) {
    const dir = join(SPOT_DIR, symbol);
    if (!existsSync(dir)) continue;
    const spotText = readdirSync(dir).filter((f) => f.endsWith(".zip")).sort().map((f) => extractSingleFile(readFileSync(join(dir, f))).toString("utf8"));
    if (!spotText.length) continue;
    const perp = loadInstrumentData(symbol, 24, Infinity).find((x) => x.id === symbol);
    if (!perp) continue;
    const daily = Array.from({ length: perp.daily.length }, (_, i) => ({ openTime: perp.daily.openTime[i], open: perp.daily.open[i], high: perp.daily.high[i], low: perp.daily.low[i], close: perp.daily.close[i] }));
    instruments.set(symbol, {
      symbol,
      perp: toDailyMap(daily),
      // El perpetuo "1000PEPE" cotiza 1000 PEPE: el spot se lleva a esa escala.
      spot: toDailyMap(parseKlinesCsv(spotText.join("\n")), factor),
      fundingTime: perp.funding.time,
      fundingRate: perp.funding.rate,
    });
  }
  const universe: UniverseSnapshot[] = JSON.parse(readFileSync(UNIVERSE_PATH, "utf8")).snapshots;
  console.log(`Carry: ${instruments.size} pares con perpetuo y spot.`);
  cache = { instruments, universe };
  return cache;
}

export function carryStrategy(params: CarryParams): CustomStrategy {
  const id = `CARRY_t${Math.round(params.tIn * 100)}_${params.universe}`;
  return {
    id,
    family: "baseline",
    timeframeHours: 24,
    run(cfg: SimConfig): SimResult {
      const { instruments, universe } = loadCarryData();
      const candidatesAt = (day: number) => {
        const snap = universeAt(universe, day);
        const rankOf = (s: string) => (snap ? snap.ranked.indexOf(s) + 1 || Infinity : Infinity);
        if (params.universe === "btc_eth") return ["BTCUSDT", "ETHUSDT"].map((symbol) => ({ symbol, rank: rankOf(symbol) }));
        return (snap?.ranked.slice(0, 30) ?? []).filter((x) => !x.includes("~")).map((symbol, k) => ({ symbol, rank: k + 1 }));
      };
      return simulateCarry(id, params, instruments, candidatesAt, cfg);
    },
  };
}
