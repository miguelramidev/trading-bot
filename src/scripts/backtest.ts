// Backtest de signal_history contra velas públicas de Binance Futures (sin API keys).
// Replica la lógica de cierre de src/cron/analyze.ts (monitor de SL/TP con
// gridSL/gridTP y fallback a stopLoss/takeProfit) sin look-ahead: la entrada
// se simula al open de la primera vela POSTERIOR a evaluated_at.
//
// No replica breakeven: el monitor automático de breakeven fue removido del
// código (commit b026fb1, "replace breakeven monitor with daily pnl report
// cron"). `breakeven_moved`/`breakevenTarget` en el schema son columnas
// muertas de esa feature — no hay lógica activa que mueva el SL a breakeven
// hoy, así que no hay nada que replicar.
//
// Modos:
//   --mode=validate  (default) corre solo sobre los trades reales cerrados
//                     (decision LIKE 'Tomada%' AND realized_pnl IS NOT NULL,
//                     hoy 66) y compara el primer toque simulado (SL/TP)
//                     contra el resultado real. Correr esto SIEMPRE antes de
//                     analizar las 602 señales completas.
//   --mode=full       corre sobre todas las señales de signal_history
//                     (incluye pendientes/descartadas: "qué hubiera pasado
//                     si se operaban todas").
//
// No hay claves de Binance involucradas: ccxt se usa sin apiKey/secret,
// solo contra endpoints públicos de mercado. Lee la base analítica
// (ANALYTICS_DATABASE_URL) de solo lectura; nunca escribe en la base.
// Los resultados se guardan en data_dl/ (gitignorado), no en la base.
//
// Correr: npx tsx src/scripts/backtest.ts [--mode=validate|full] [--horizon-hours=168]

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import ccxt from "ccxt";
import { writeFileSync, mkdirSync } from "node:fs";

// --- Conexión de solo lectura a la rama analítica ---
const rawUrl = process.env.ANALYTICS_DATABASE_URL;
if (!rawUrl) {
  throw new Error("Falta ANALYTICS_DATABASE_URL. Este script solo lee de la rama analítica de Neon.");
}
const analyticsUrl: string = rawUrl;
function scrub(text: string): string {
  return text.replaceAll(analyticsUrl, "[REDACTED]");
}
const sql = neon(analyticsUrl);
async function queryAnalytics<T = any>(text: string, params: any[] = []): Promise<T[]> {
  try {
    return (await sql.query(text, params)) as T[];
  } catch (e: any) {
    throw new Error(scrub(String(e?.message ?? e)));
  }
}

// --- Exchange público, sin claves ---
const exchange = new (ccxt as any).binance({
  enableRateLimit: true,
  options: { defaultType: "future" },
});

// Comisión taker de Binance Futures (entrada a mercado + SL/TP como STOP_MARKET/
// TAKE_PROFIT_MARKET → ambos lados son taker). 0.05% por lado es la tarifa
// estándar sin descuento BNB ni nivel VIP; la real depende de la cuenta y no
// se puede reconstruir históricamente (no se guarda el apalancamiento por
// señal — ver ROADMAP.md, "opción A" y la tabla trade_executions propuesta).
const TAKER_FEE = 0.0005;
const ROUND_TRIP_FEE = TAKER_FEE * 2;

// Guardrail contra datos corruptos: si el precio de entrada simulado difiere más de este
// % del precio original de la señal, se descarta en vez de simularse. Encontrado con la
// señal 99 (AIN/USDT): un ticker relistado en Binance a otra escala de precio hace que
// los klines públicos de "hoy" no correspondan al activo que generó la señal en su momento
// (82.9% de diferencia, imposible en una sola vela de 15m).
const ENTRY_MISMATCH_GUARDRAIL_PCT = 20;

function parseTimeframeMs(tf: string): number {
  const m = tf.match(/^(\d+)([mhd])$/);
  if (!m) throw new Error(`Timeframe no soportado: ${tf}`);
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 60 * 60_000;
  return n * 24 * 60 * 60_000; // "d"
}

interface SignalRow {
  id: number;
  symbol: string;
  timeframe: string;
  evaluated_at: string;
  direction: "LONG" | "SHORT";
  entry: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  grid_sl: string | null;
  grid_tp: string | null;
  decision: string | null;
  realized_pnl: string | null;
  executed_entry_price: string | null;
}

type EntryMethod = "next_open" | "executed_price";

interface BacktestResult {
  signal_id: number;
  symbol: string;
  direction: string;
  entry_price: number;
  sl_used: number;
  tp_used: number;
  first_touch: "SL" | "TP" | "NONE" | "NO_DATA" | "ENTRY_MISMATCH";
  ambiguous: boolean; // SL y TP tocados en la misma vela
  time_to_close_minutes: number | null;
  candles_scanned: number;
  mfe_pct: number | null; // Máxima excursión a favor
  mae_pct: number | null; // Máxima excursión en contra
  gross_return_pct: number | null;
  net_return_pct_est: number | null; // neto de comisión taker estimada ida y vuelta
  real_decision: string | null;
  real_first_touch: "SL" | "TP" | null;
  real_realized_pnl: number | null;
  match: boolean | null; // solo en modo validate
  entry_method: EntryMethod;
}

function extractRealFirstTouch(decision: string | null): "SL" | "TP" | null {
  if (!decision) return null;
  if (decision.includes("SL Tocado")) return "SL";
  if (decision.includes("TP Tocado")) return "TP";
  return null;
}

async function fetchCandles(symbol: string, timeframe: string, sinceMs: number, limit: number) {
  // ccxt reintenta internamente errores de rate-limit transitorios con enableRateLimit.
  return exchange.fetchOHLCV(symbol, timeframe, sinceMs, limit);
}

async function simulateSignal(row: SignalRow, horizonMs: number, entryMethod: EntryMethod): Promise<BacktestResult> {
  const direction = row.direction;
  const sl = parseFloat(row.grid_sl || row.stopLoss || "0");
  const tp = parseFloat(row.grid_tp || row.takeProfit || "0");
  const evaluatedAtMs = new Date(row.evaluated_at).getTime();
  const tfMs = parseTimeframeMs(row.timeframe || "15m");
  const limit = Math.ceil(horizonMs / tfMs) + 5; // margen por el filtrado de "vela siguiente"

  const base: Omit<BacktestResult, "first_touch" | "entry_price" | "candles_scanned" | "ambiguous" | "time_to_close_minutes" | "mfe_pct" | "mae_pct" | "gross_return_pct" | "net_return_pct_est"> = {
    signal_id: row.id,
    symbol: row.symbol,
    direction,
    sl_used: sl,
    tp_used: tp,
    real_decision: row.decision,
    real_first_touch: extractRealFirstTouch(row.decision),
    real_realized_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : null,
    match: null,
    entry_method: entryMethod,
  };

  let candles: number[][];
  try {
    candles = await fetchCandles(row.symbol, row.timeframe || "15m", evaluatedAtMs, limit);
  } catch (e: any) {
    console.error(`  [WARN] No se pudieron traer velas de ${row.symbol} (señal ${row.id}): ${e.message}`);
    return { ...base, first_touch: "NO_DATA", entry_price: NaN, candles_scanned: 0, ambiguous: false, time_to_close_minutes: null, mfe_pct: null, mae_pct: null, gross_return_pct: null, net_return_pct_est: null };
  }

  // Sin look-ahead: la primera vela ELEGIBLE es la que abre estrictamente
  // después de evaluated_at.
  const forward = candles.filter((c) => c[0] > evaluatedAtMs);
  if (forward.length === 0) {
    return { ...base, first_touch: "NO_DATA", entry_price: NaN, candles_scanned: 0, ambiguous: false, time_to_close_minutes: null, mfe_pct: null, mae_pct: null, gross_return_pct: null, net_return_pct_est: null };
  }

  let entryIdx = 0;
  let entryPrice: number;

  if (entryMethod === "executed_price" && row.executed_entry_price) {
    // Estima la hora real de entrada: primera vela donde el rango [low, high]
    // contiene executed_entry_price (el precio real de fill en Binance).
    const target = parseFloat(row.executed_entry_price);
    const idx = forward.findIndex((c) => c[3] <= target && target <= c[2]); // low <= target <= high
    if (idx === -1) {
      // El precio de fill real no aparece en ninguna vela pública del rango
      // (o el horizonte quedó corto): no se puede estimar, se descarta.
      return { ...base, first_touch: "NO_DATA", entry_price: NaN, candles_scanned: 0, ambiguous: false, time_to_close_minutes: null, mfe_pct: null, mae_pct: null, gross_return_pct: null, net_return_pct_est: null };
    }
    entryIdx = idx;
    entryPrice = target; // anclado al fill real, no al open de la vela
  } else {
    entryPrice = forward[0][1]; // open de la vela siguiente a evaluated_at
  }

  // Guardrail: descarta señales donde la entrada simulada implica un salto de precio
  // imposible respecto al precio original de la señal (colisión de ticker / dato corrupto).
  const signalEntry = row.entry ? parseFloat(row.entry) : NaN;
  if (isFinite(signalEntry) && signalEntry > 0) {
    const mismatchPct = (Math.abs(entryPrice - signalEntry) / signalEntry) * 100;
    if (mismatchPct > ENTRY_MISMATCH_GUARDRAIL_PCT) {
      return { ...base, first_touch: "ENTRY_MISMATCH", entry_price: entryPrice, candles_scanned: 0, ambiguous: false, time_to_close_minutes: null, mfe_pct: null, mae_pct: null, gross_return_pct: null, net_return_pct_est: null };
    }
  }

  const entryCandle = forward[entryIdx];
  const entryTimeMs = entryCandle[0];

  let maxHigh = -Infinity;
  let minLow = Infinity;
  let firstTouch: "SL" | "TP" | "NONE" = "NONE";
  let ambiguous = false;
  let closeCandleIdx = -1;

  for (let i = entryIdx; i < forward.length; i++) {
    const [ts, , high, low] = forward[i];
    if (ts - entryTimeMs > horizonMs) break;
    maxHigh = Math.max(maxHigh, high);
    minLow = Math.min(minLow, low);

    // Misma lógica que analyze.ts:51-57 (orden SL antes que TP en el if/else-if).
    let slHit: boolean, tpHit: boolean;
    if (direction === "LONG") {
      slHit = low <= sl;
      tpHit = high >= tp;
    } else {
      slHit = high >= sl;
      tpHit = low <= tp;
    }

    if (slHit && tpHit) {
      ambiguous = true;
      firstTouch = "SL"; // mismo tie-break que el código real (SL se chequea primero)
      closeCandleIdx = i;
      break;
    } else if (slHit) {
      firstTouch = "SL";
      closeCandleIdx = i;
      break;
    } else if (tpHit) {
      firstTouch = "TP";
      closeCandleIdx = i;
      break;
    }
  }

  const scannedCount =
    closeCandleIdx >= 0
      ? closeCandleIdx - entryIdx + 1
      : forward.slice(entryIdx).filter((c) => c[0] - entryTimeMs <= horizonMs).length;

  let timeToCloseMinutes: number | null = null;
  let exitPrice: number | null = null;
  if (closeCandleIdx >= 0) {
    const closeCandle = forward[closeCandleIdx];
    timeToCloseMinutes = (closeCandle[0] + tfMs - entryTimeMs) / 60_000;
    exitPrice = firstTouch === "SL" ? sl : tp;
  }

  const favorable = direction === "LONG" ? maxHigh - entryPrice : entryPrice - minLow;
  const adverse = direction === "LONG" ? entryPrice - minLow : maxHigh - entryPrice;
  const mfePct = isFinite(favorable) ? (favorable / entryPrice) * 100 : null;
  const maePct = isFinite(adverse) ? (adverse / entryPrice) * 100 : null;

  let grossReturnPct: number | null = null;
  let netReturnPct: number | null = null;
  if (exitPrice !== null) {
    grossReturnPct = direction === "LONG" ? ((exitPrice - entryPrice) / entryPrice) * 100 : ((entryPrice - exitPrice) / entryPrice) * 100;
    netReturnPct = grossReturnPct - ROUND_TRIP_FEE * 100;
  }

  const match = base.real_first_touch ? base.real_first_touch === firstTouch : null;

  return {
    ...base,
    first_touch: firstTouch,
    entry_price: entryPrice,
    candles_scanned: scannedCount,
    ambiguous,
    time_to_close_minutes: timeToCloseMinutes,
    mfe_pct: mfePct,
    mae_pct: maePct,
    gross_return_pct: grossReturnPct,
    net_return_pct_est: netReturnPct,
    match,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (args.find((a) => a.startsWith("--mode="))?.split("=")[1] || "validate") as "validate" | "full";
  const horizonHours = parseInt(args.find((a) => a.startsWith("--horizon-hours="))?.split("=")[1] || "168", 10);
  const horizonMs = horizonHours * 60 * 60_000;
  // "next_open": entra al open de la vela siguiente a evaluated_at (sin look-ahead, default).
  // "executed_price": ancla la entrada a la primera vela donde el precio alcanzó
  // executed_entry_price (el fill real en Binance) — solo tiene sentido en modo validate,
  // porque es el único conjunto con ese dato.
  const entryMethod = (args.find((a) => a.startsWith("--entry="))?.split("=")[1] || "next_open") as EntryMethod;

  console.log(`Backtest en modo "${mode}", horizonte ${horizonHours}h, entrada "${entryMethod}". Fuente: klines públicos de Binance Futures (sin claves).`);

  const query =
    mode === "validate"
      ? `SELECT id, symbol, timeframe, evaluated_at, direction, entry, "stopLoss", "takeProfit", grid_sl, grid_tp, decision, realized_pnl, executed_entry_price
         FROM signal_history
         WHERE decision LIKE 'Tomada%' AND realized_pnl IS NOT NULL
         ORDER BY evaluated_at ASC;`
      : `SELECT id, symbol, timeframe, evaluated_at, direction, entry, "stopLoss", "takeProfit", grid_sl, grid_tp, decision, realized_pnl, executed_entry_price
         FROM signal_history
         ORDER BY evaluated_at ASC;`;

  const rows = (await queryAnalytics<SignalRow>(query)) as SignalRow[];
  console.log(`Señales a simular: ${rows.length}`);

  const results: BacktestResult[] = [];
  let i = 0;
  for (const row of rows) {
    i++;
    process.stdout.write(`\r  Simulando ${i}/${rows.length} (${row.symbol})...`);
    const r = await simulateSignal(row, horizonMs, entryMethod);
    results.push(r);
  }
  console.log("");

  mkdirSync("data_dl", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `data_dl/backtest_${mode}_${stamp}.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Resultados guardados en ${outPath}`);

  const entryMismatchCount = results.filter((r) => r.first_touch === "ENTRY_MISMATCH").length;
  if (entryMismatchCount > 0) {
    console.log(`\n[GUARDRAIL] ${entryMismatchCount} señal(es) excluida(s) por diferencia de entrada > ${ENTRY_MISMATCH_GUARDRAIL_PCT}% (posible colisión de ticker / dato corrupto):`);
    for (const r of results.filter((r) => r.first_touch === "ENTRY_MISMATCH")) {
      console.log(`  señal ${r.signal_id} (${r.symbol})`);
    }
  }

  if (mode === "validate") {
    const withRealTouch = results.filter((r) => r.real_first_touch !== null);
    const withData = withRealTouch.filter((r) => r.first_touch !== "NO_DATA" && r.first_touch !== "ENTRY_MISMATCH");
    const noData = withRealTouch.length - withData.length;
    const matches = withData.filter((r) => r.match === true).length;
    const mismatches = withData.filter((r) => r.match === false);
    const ambiguousCount = withData.filter((r) => r.ambiguous).length;
    const noneCount = withData.filter((r) => r.first_touch === "NONE").length;

    console.log("\n=== VALIDACIÓN (66 trades reales) ===");
    console.log(`Total con resultado real conocido: ${withRealTouch.length}`);
    console.log(`Sin datos de velas o excluidos por guardrail (NO_DATA/ENTRY_MISMATCH): ${noData}`);
    console.log(`Coincidencias (first_touch simulado == real): ${matches}/${withData.length} (${((matches / withData.length) * 100).toFixed(1)}%)`);
    console.log(`Velas ambiguas (SL y TP en la misma vela): ${ambiguousCount}`);
    console.log(`Simulación nunca tocó SL/TP dentro del horizonte: ${noneCount}`);
    if (mismatches.length > 0) {
      console.log(`\nDesacuerdos (${mismatches.length}):`);
      for (const m of mismatches) {
        console.log(`  señal ${m.signal_id} (${m.symbol}, ${m.direction}): real=${m.real_first_touch} simulado=${m.first_touch}${m.ambiguous ? " (ambiguo)" : ""}`);
      }
    }
  } else {
    const touched = results.filter((r) => r.first_touch === "SL" || r.first_touch === "TP");
    console.log(`\nSeñales con resultado simulado: ${touched.length}/${results.length}`);
    console.log(`Ambiguas: ${touched.filter((r) => r.ambiguous).length}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  });
