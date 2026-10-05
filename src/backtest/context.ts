// Carga compartida por los CLIs del backtest (run.ts, validate.ts): universo point-in-time e
// instrumentos que alguna vez estuvieron en él durante el período.
import { readFileSync, existsSync } from "node:fs";
import { loadInstrumentData } from "./data/load.js";
import { HOUR_MS } from "./data/candles.js";
import { UNIVERSE_PATH } from "./data/paths.js";
import type { UniverseSnapshot } from "./universe.js";
import type { InstrumentData, MarketData } from "./engine/types.js";

export function loadUniverse(): UniverseSnapshot[] {
  if (!existsSync(UNIVERSE_PATH)) throw new Error("Falta el universo: correr antes npx tsx src/backtest/prepare.ts");
  return JSON.parse(readFileSync(UNIVERSE_PATH, "utf8")).snapshots;
}

export function loadMarket(
  universe: UniverseSnapshot[],
  tfHours: number,
  from: number,
  to: number
): { instruments: Map<string, InstrumentData>; market: MarketData } {
  const ids = new Set(universe.filter((s) => s.date >= from && s.date < to).flatMap((s) => s.ranked));
  const symbols = [...new Set([...ids].map((id) => id.split("~")[0]))];
  console.log(`Cargando ${symbols.length} símbolos (TF ${tfHours}h)...`);
  const instruments = new Map<string, InstrumentData>();
  for (const symbol of symbols) {
    for (const inst of loadInstrumentData(symbol, tfHours, from - 24 * HOUR_MS)) {
      if (ids.has(inst.id)) instruments.set(inst.id, inst);
    }
  }
  const btc = loadInstrumentData("BTCUSDT", tfHours, from)[0];
  return { instruments, market: { btcDaily: btc.daily } };
}

/** Agrupa estrategias por TF para cargar los datos una sola vez por TF. */
export function groupByTimeframe<T extends { timeframeHours: number }>(items: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const s of items) out.set(s.timeframeHours, [...(out.get(s.timeframeHours) ?? []), s]);
  return out;
}
