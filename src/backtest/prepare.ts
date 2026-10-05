// Paso de preparación (correr después de download.ts y cada vez que se actualicen los datos):
// deriva las velas diarias de cada instrumento y arma el universo point-in-time, y los guarda en
// data_dl/um/ para no recalcularlos en cada corrida del backtest.
//
// Además deja un reporte de calidad de datos (huecos, saltos de precio sospechosos).
//
// Correr: npx tsx src/backtest/prepare.ts
import { writeFileSync } from "node:fs";
import { resample, type Candle } from "./data/candles.js";
import { listDownloadedSymbols, loadInstruments } from "./data/store.js";
import { UNIVERSE_PATH, QUALITY_PATH, MIN_NOTIONAL_PATH } from "./data/paths.js";
import { buildUniverse, DEFAULT_UNIVERSE_OPTIONS } from "./universe.js";

/** Salto de cierre a cierre (1h) que no debería pasar en un mismo activo: posible cambio de escala. */
const SUSPICIOUS_JUMP = 0.5;

/** MIN_NOTIONAL actual de cada par (exchangeInfo público). Lo usa el simulador para la Regla 1. */
async function saveMinNotionals() {
  const res = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
  if (!res.ok) throw new Error(`exchangeInfo: HTTP ${res.status}`);
  const info: any = await res.json();
  const out: Record<string, number> = {};
  for (const s of info.symbols) {
    const f = s.filters.find((x: any) => x.filterType === "MIN_NOTIONAL");
    if (f) out[s.symbol] = Number(f.notional);
  }
  writeFileSync(MIN_NOTIONAL_PATH, JSON.stringify(out));
  console.log(`MIN_NOTIONAL de ${Object.keys(out).length} pares → ${MIN_NOTIONAL_PATH}`);
}

async function main() {
  await saveMinNotionals();

  const symbols = listDownloadedSymbols();
  const daily = new Map<string, Candle[]>();
  const quality: { id: string; hours: number; segments: number; suspiciousJumps: { time: string; from: number; to: number }[] }[] = [];

  for (const symbol of symbols) {
    const instruments = loadInstruments(symbol);
    for (const inst of instruments) {
      daily.set(inst.id, resample(inst.candles1h, 24));
      const jumps: { time: string; from: number; to: number }[] = [];
      const c = inst.candles1h;
      for (let i = 1; i < c.length; i++) {
        const r = c[i].close / c[i - 1].close - 1;
        if (Math.abs(r) > SUSPICIOUS_JUMP) jumps.push({ time: new Date(c[i].openTime).toISOString(), from: c[i - 1].close, to: c[i].close });
      }
      quality.push({ id: inst.id, hours: c.length, segments: instruments.length, suspiciousJumps: jumps });
    }
    process.stdout.write(".");
  }
  console.log(`\n${daily.size} instrumentos (${symbols.length} símbolos).`);

  const snapshots = buildUniverse(daily, DEFAULT_UNIVERSE_OPTIONS);
  writeFileSync(UNIVERSE_PATH, JSON.stringify({ options: DEFAULT_UNIVERSE_OPTIONS, snapshots }));
  const everIn = new Set(snapshots.flatMap((s) => s.ranked));
  console.log(`Universo: ${snapshots.length} días, ${everIn.size} instrumentos distintos pasaron por el top ${DEFAULT_UNIVERSE_OPTIONS.topN}.`);
  console.log(`Primer día: ${new Date(snapshots[0].date).toISOString().slice(0, 10)} (${snapshots[0].ranked.length} instrumentos).`);

  const flagged = quality.filter((q) => q.suspiciousJumps.length > 0 || q.segments > 1);
  writeFileSync(QUALITY_PATH, JSON.stringify({ suspiciousJumpThreshold: SUSPICIOUS_JUMP, flagged }, null, 2));
  console.log(`Calidad: ${flagged.length} instrumentos con saltos > ${SUSPICIOUS_JUMP * 100}% en 1h o con más de un tramo → ${QUALITY_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
