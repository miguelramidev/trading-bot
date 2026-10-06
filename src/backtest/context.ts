// Carga compartida por los CLIs del backtest (run.ts, validate.ts): universo point-in-time e
// instrumentos que alguna vez estuvieron en él durante el período.
import { readFileSync, existsSync } from "node:fs";
import { loadInstrumentData } from "./data/load.js";
import { listDownloadedSymbols } from "./data/store.js";
import { HOUR_MS } from "./data/candles.js";
import { UNIVERSE_PATH } from "./data/paths.js";
import type { UniverseSnapshot } from "./universe.js";
import { isCustom, type AnyStrategy, type InstrumentData, type MarketData, type SimConfig, type SimResult } from "./engine/types.js";
import { simulate } from "./engine/simulate.js";

export function loadUniverse(): UniverseSnapshot[] {
  if (!existsSync(UNIVERSE_PATH)) throw new Error("Falta el universo: correr antes npx tsx src/backtest/prepare.ts");
  return JSON.parse(readFileSync(UNIVERSE_PATH, "utf8")).snapshots;
}

export interface LoadOptions {
  /** Todos los instrumentos que cotizan en el período, no solo los que pasaron por el universo. */
  allInstruments?: boolean;
  /** Cargar las métricas de posicionamiento. */
  metrics?: boolean;
}

export function loadMarket(
  universe: UniverseSnapshot[],
  tfHours: number,
  from: number,
  to: number,
  opts: LoadOptions = {}
): { instruments: Map<string, InstrumentData>; market: MarketData } {
  const ids = new Set(universe.filter((s) => s.date >= from && s.date < to).flatMap((s) => s.ranked));
  const symbols = opts.allInstruments ? listDownloadedSymbols() : [...new Set([...ids].map((id) => id.split("~")[0]))];
  console.log(`Cargando ${symbols.length} símbolos (TF ${tfHours}h${opts.allInstruments ? ", todos los instrumentos" : ""}${opts.metrics ? ", con métricas" : ""})...`);
  const instruments = new Map<string, InstrumentData>();
  for (const symbol of symbols) {
    for (const inst of loadInstrumentData(symbol, tfHours, from - 24 * HOUR_MS, { metrics: opts.metrics })) {
      const keep = opts.allInstruments ? inst.h1.length > 0 && inst.h1.openTime[0] < to : ids.has(inst.id);
      if (keep) instruments.set(inst.id, inst);
    }
  }
  const btc = loadInstrumentData("BTCUSDT", tfHours, from)[0];
  // Con TF de 1h, la serie de BTC en 1h (para la correlación por retornos de cada moneda).
  return { instruments, market: { btcDaily: btc.daily, btcH1: tfHours === 1 ? btc.tf : undefined } };
}

/** Opciones de carga que necesita un grupo de estrategias del mismo TF. */
export function loadOptionsFor(group: AnyStrategy[]): LoadOptions {
  const sims = group.filter((s) => !isCustom(s)) as Exclude<AnyStrategy, { run: unknown }>[];
  return { allInstruments: sims.some((s) => s.universe === "all"), metrics: sims.some((s) => s.needsMetrics) };
}

/** Agrupa estrategias por TF para cargar los datos una sola vez por TF. */
export function groupByTimeframe<T extends { timeframeHours: number }>(items: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const s of items) out.set(s.timeframeHours, [...(out.get(s.timeframeHours) ?? []), s]);
  return out;
}

/**
 * Corre una estrategia del grupo: las de simulador propio (`run`) cargan sus datos; para las demás
 * se carga el mercado una sola vez por grupo, y solo si hace falta.
 */
export function makeRunner(universe: UniverseSnapshot[], tfHours: number, from: number, to: number, group: AnyStrategy[]) {
  let loaded: ReturnType<typeof loadMarket> | null = null;
  return (s: AnyStrategy, cfg: SimConfig): SimResult => {
    if (isCustom(s)) return s.run(cfg);
    loaded ??= loadMarket(universe, tfHours, from, to, loadOptionsFor(group));
    return simulate(s, loaded.instruments, loaded.market, universe, cfg);
  };
}
