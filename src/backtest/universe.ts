// Universo point-in-time: el top N por volumen tal como se veía CADA día, usando solo velas
// diarias ya cerradas al momento de decidir. Reemplaza al "top 100 de hoy" de
// scripts_py/download_top100.py, que tiene sesgo de supervivencia y look-ahead (ver
// docs/investigacion/2026-10-05-estrategias-1h-1d.md §8.2).
import { DAY_MS, type Candle } from "./data/candles.js";
import { looksLikeStablecoin } from "./data/symbols.js";

export interface UniverseOptions {
  topN: number;
  /** Ventana (en días) de la mediana de quote volume que define el ranking. */
  volumeWindowDays: number;
  /** Días mínimos de historia del instrumento antes de poder entrar al universo. */
  minHistoryDays: number;
}

export const DEFAULT_UNIVERSE_OPTIONS: UniverseOptions = {
  topN: 100,
  volumeWindowDays: 30,
  minHistoryDays: 30,
};

export interface UniverseSnapshot {
  /** 00:00 UTC del día de decisión. Solo usa velas diarias con openTime < date. */
  date: number;
  /** Ids de instrumento ordenados por volumen (posición 0 = rank 1). */
  ranked: string[];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Arma un snapshot por día. `daily` mapea id de instrumento → velas diarias (ordenadas).
 * Un instrumento entra al ranking del día `date` si tiene al menos `minHistoryDays` velas
 * diarias cerradas antes de `date`, su última vela cerrada es la del día anterior (sigue
 * cotizando) y no parece una stablecoin (mediana de cierres ≈ $1).
 */
export function buildUniverse(daily: Map<string, Candle[]>, opts: UniverseOptions = DEFAULT_UNIVERSE_OPTIONS): UniverseSnapshot[] {
  // Volumen mediano de cada instrumento indexado por el día de decisión en el que es válido.
  const scoreByDate = new Map<number, { id: string; score: number }[]>();

  for (const [id, candles] of daily) {
    for (let i = 0; i < candles.length; i++) {
      const closedCount = i + 1; // velas 0..i están cerradas al empezar el día siguiente
      if (closedCount < Math.max(opts.minHistoryDays, opts.volumeWindowDays)) continue;
      const date = candles[i].openTime + DAY_MS; // decisión al cierre de la vela i
      const window = candles.slice(i + 1 - opts.volumeWindowDays, i + 1);
      if (looksLikeStablecoin(median(window.map((c) => c.close)))) continue;
      const score = median(window.map((c) => c.quoteVolume));
      const list = scoreByDate.get(date) ?? [];
      list.push({ id, score });
      scoreByDate.set(date, list);
    }
  }

  return [...scoreByDate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([date, list]) => ({
      date,
      ranked: list
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, opts.topN)
        .map((x) => x.id),
    }));
}

/** Snapshot vigente en el instante `t`: el último con date ≤ t (búsqueda binaria). `null` si no hay. */
export function universeAt(snapshots: UniverseSnapshot[], t: number): UniverseSnapshot | null {
  let lo = 0;
  let hi = snapshots.length - 1;
  let found: UniverseSnapshot | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].date <= t) {
      found = snapshots[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
