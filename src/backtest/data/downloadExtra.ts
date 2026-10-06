// Descargas para las líneas del 2026-10-06 (docs/investigacion/2026-10-06-tres-lineas.md), solo
// para los símbolos y fechas en que estuvieron en el top N del universo point-in-time (más un mes
// de calentamiento). Bajar todo serían más de un millón de archivos diarios.
//
//   metrics: posicionamiento de 5m de futures/um (open interest, ratios long/short, taker), un
//            zip por día. Binance lo publica desde 2021-12 para las altcoins.
//   spot:    velas diarias del par spot equivalente (para el carry de funding). Los perpetuos
//            "1000X" se mapean al spot "X" con factor 1000; los que no tienen spot se omiten.
//
// Requiere universe.json (correr antes download.ts + prepare.ts).
// Correr: npx tsx src/backtest/data/downloadExtra.ts --dataset=metrics|spot [--top=30]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAY_MS } from "./candles.js";
import { METRICS_DIR, SPOT_DIR, SPOT_MAP_PATH, UNIVERSE_PATH } from "./paths.js";
import { arg, listS3, downloadVerified, pool } from "./binanceVision.js";
import { spotFor } from "./symbols.js";
import type { UniverseSnapshot } from "../universe.js";

const METRICS_START = Date.parse("2021-12-01T00:00:00Z");
const SPOT_START = Date.parse("2020-12-01T00:00:00Z");
const END = Date.parse("2026-10-01T00:00:00Z");
const WARMUP_DAYS = 31;

/** Días (00:00 UTC) en que cada símbolo estuvo en el top N, más WARMUP_DAYS antes de cada uno. */
function daysInTop(topN: number, from: number): Map<string, Set<number>> {
  const snaps: UniverseSnapshot[] = JSON.parse(readFileSync(UNIVERSE_PATH, "utf8")).snapshots;
  const out = new Map<string, Set<number>>();
  for (const s of snaps) {
    if (s.date >= END) continue;
    for (const id of s.ranked.slice(0, topN)) {
      const symbol = id.split("~")[0];
      const set = out.get(symbol) ?? new Set<number>();
      for (let k = 0; k <= WARMUP_DAYS; k++) {
        const d = s.date - k * DAY_MS;
        if (d >= from) set.add(d);
      }
      out.set(symbol, set);
    }
  }
  return out;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

async function main() {
  const dataset = arg("dataset");
  const topN = Number(arg("top") ?? 30);
  const jobs: { key: string; dest: string }[] = [];

  if (dataset === "metrics") {
    for (const [symbol, days] of daysInTop(topN, METRICS_START)) {
      const dir = join(METRICS_DIR, symbol);
      mkdirSync(dir, { recursive: true });
      for (const d of [...days].sort()) {
        const name = `${symbol}-metrics-${iso(d)}.zip`;
        jobs.push({ key: `data/futures/um/daily/metrics/${symbol}/${name}`, dest: join(dir, name) });
      }
    }
  } else if (dataset === "spot") {
    const spotSymbols = new Set((await listS3("data/spot/monthly/klines/", "prefixes")).map((p) => p.split("/").at(-2)!));
    const map: Record<string, { spot: string; factor: number }> = {};
    for (const [perp, days] of daysInTop(topN, SPOT_START)) {
      const s = spotFor(perp, spotSymbols);
      if (!s) continue;
      map[perp] = s;
      const dir = join(SPOT_DIR, perp);
      mkdirSync(dir, { recursive: true });
      const months = new Set([...days].map((d) => iso(d).slice(0, 7)));
      for (const m of [...months].sort()) {
        const name = `${s.spot}-1d-${m}.zip`;
        jobs.push({ key: `data/spot/monthly/klines/${s.spot}/1d/${name}`, dest: join(dir, name) });
      }
    }
    writeFileSync(SPOT_MAP_PATH, JSON.stringify(map, null, 2));
    console.log(`${Object.keys(map).length} perpetuos del top ${topN} con spot equivalente.`);
  } else {
    throw new Error("Falta --dataset=metrics|spot");
  }

  console.log(`${jobs.length} archivos a revisar (${dataset}, top ${topN}).`);
  let ok = 0, skipped = 0, missing = 0, done = 0;
  const errors: string[] = [];
  await pool(
    jobs,
    async (j) => {
      try {
        const r = await downloadVerified(j.key, j.dest);
        if (r === "ok") ok++;
        else if (r === "skip") skipped++;
        else missing++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      if (++done % 5000 === 0) console.log(`${done}/${jobs.length} (${ok} nuevos, ${skipped} ya estaban, ${missing} no existen, ${errors.length} errores)`);
    },
    32
  );
  console.log(`Listo: ${ok} nuevos, ${skipped} ya estaban, ${missing} no existen en Binance, ${errors.length} errores.`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
