// Rutas de los datos del backtest. Todo vive en data_dl/ (gitignorado): se regenera con
// download.ts + prepare.ts.
import { join } from "node:path";

export const DATA_ROOT = join(process.cwd(), "data_dl");
export const UM_DIR = join(DATA_ROOT, "um");
/** Zips verificados por checksum: um/raw/<klines_1h|funding>/<SYMBOL>/<archivo>.zip */
export const RAW_DIR = join(UM_DIR, "raw");
export const KLINES_DIR = join(RAW_DIR, "klines_1h");
export const FUNDING_DIR = join(RAW_DIR, "funding");

export const SYMBOLS_PATH = join(UM_DIR, "symbols.json");
export const UNIVERSE_PATH = join(UM_DIR, "universe.json");
export const QUALITY_PATH = join(UM_DIR, "quality.json");
export const MIN_NOTIONAL_PATH = join(UM_DIR, "min_notional.json");

export const BACKTESTS_DIR = join(DATA_ROOT, "backtests");

/** Métricas de posicionamiento de 5m (open interest, ratios long/short, taker): un zip por día. */
export const METRICS_DIR = join(RAW_DIR, "metrics");
/** Velas diarias de SPOT del par equivalente de cada perpetuo (para el carry de funding). */
export const SPOT_DIR = join(RAW_DIR, "spot_1d");
/** perpetuo → { spot, factor }: "1000PEPEUSDT" → { spot: "PEPEUSDT", factor: 1000 }. */
export const SPOT_MAP_PATH = join(UM_DIR, "spot_map.json");

/** Calendario de desbloqueos de DefiLlama (downloadUnlocks.ts). */
export const UNLOCKS_DIR = join(DATA_ROOT, "unlocks");
export const UNLOCK_SYMBOLS_PATH = join(UNLOCKS_DIR, "symbols.json");
