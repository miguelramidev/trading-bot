// Auditoría de breakeven a +1R: qué habría pasado si, al llegar a +1R, el SL
// se movía a la entrada (variante b) o a la entrada + comisión ida y vuelta
// (variante c), comparado contra la variante base sin cambios (a).
// Ver la skill `auditoria-trades` antes de interpretar los resultados, y
// `docs/auditorias/2026-10-01-breakeven.md` para el informe narrado.
//
// Solo lee ANALYTICS_DATABASE_URL (rama de solo lectura de Neon, vía
// scripts/analysis/lib/analyticsDb.ts) y klines públicos de Binance Futures
// (ccxt sin API keys). No escribe en la base. Resultados en data_dl/
// (gitignorado). Cachea velas en scratch/cache/ (gitignorado) para no
// repetir pedidos a Binance entre corridas.
//
// Guardrail importante (agregado tras la revisión del 2026-10-01): si para
// cuando se simula la entrada (open de la vela de 15m siguiente a
// evaluated_at) el precio YA cruzó el SL o el TP originales, la señal se
// excluye como "ENTRY_BEYOND_SLTP" en vez de simularse — calcular el
// retorno contra un SL/TP que ya quedó del lado equivocado de la entrada
// da números sin sentido (hasta con signo invertido). En el dataset de esa
// revisión esto afectó a ~48% de las señales con R:R 1:2.
//
// Metodología (ver plan acordado con el usuario):
// - Solo señales con R:R 1:2 calculado por señal (riesgo = |entry-SL|,
//   beneficio = |TP-entry|, ratio = beneficio/riesgo en [1.9, 2.1]).
// - Entrada al open de la vela de 15m siguiente a evaluated_at (sin
//   look-ahead), igual que src/scripts/backtest.ts.
// - Se escanea a 15m hasta encontrar la primera vela que toca +1R
//   (favorable). Si nunca se toca, las 3 variantes son idénticas (el
//   breakeven nunca se activa) y no hace falta bajar a 1m.
// - Si se toca +1R, desde el open de ESA vela de 15m se sigue a 1 minuto
//   HASTA EL CIERRE para las 3 variantes (a, b, c), no solo cuando la vela
//   de 15m también toca SL/TP. Esto cubre el caso clave: tocar +1R y volver
//   a la entrada dentro de la misma vela de 15m.
// - Paginación de velas de 1m de a 1500 (máximo de Binance) por pedido.
// - Ambigüedad a nivel de vela de 1 minuto (SL-nuevo y TP tocados en el
//   mismo minuto): se reporta peor caso (se asume que el stop se dispara
//   primero, igual tie-break que el código real de analyze.ts) y mejor
//   caso (se asume que el TP se dispara primero) por separado.
//
// Correr: npx tsx scripts/analysis/breakeven_backtest.ts [--horizon-hours=168]

import ccxt from "ccxt";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { queryAnalytics } from "./lib/analyticsDb.js";

// --- Exchange público, sin claves ---
const exchange = new (ccxt as any).binance({
  enableRateLimit: true,
  options: { defaultType: "future" },
});

const TAKER_FEE = 0.0005;
const ROUND_TRIP_FEE = TAKER_FEE * 2; // 0.10%
const ENTRY_MISMATCH_GUARDRAIL_PCT = 20;
const RR_TOLERANCE_LOW = 1.9;
const RR_TOLERANCE_HIGH = 2.1;
const CACHE_DIR = "scratch/cache";

function parseTimeframeMs(tf: string): number {
  const m = tf.match(/^(\d+)([mhd])$/);
  if (!m) throw new Error(`Timeframe no soportado: ${tf}`);
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 60 * 60_000;
  return n * 24 * 60 * 60_000;
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
  strategy: string | null;
  regime: string | null;
}

type Candle = [number, number, number, number, number, number]; // ts, o, h, l, c, v

function cacheKeyFor(symbol: string, timeframe: string, sinceMs: number): string {
  return `${symbol.replace(/[/:]/g, "_")}_${timeframe}_${sinceMs}`;
}

async function fetchCandlesCached(symbol: string, timeframe: string, sinceMs: number, limit: number): Promise<Candle[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKeyFor(symbol, timeframe, sinceMs);
  const path = `${CACHE_DIR}/${key}.json`;
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const candles = (await exchange.fetchOHLCV(symbol, timeframe, sinceMs, limit)) as Candle[];
  writeFileSync(path, JSON.stringify(candles));
  return candles;
}

interface VariantOutcome {
  first_touch: "SL" | "TP" | "NONE";
  ambiguous_1m: boolean;
  exit_price_worst: number | null;
  exit_price_best: number | null;
  time_to_close_minutes: number | null;
}

interface SimResult {
  signal_id: number;
  symbol: string;
  direction: string;
  strategy: string | null;
  regime: string | null;
  evaluated_at: string;
  entry_price: number;
  risk: number; // distancia a 1R en precio
  sl_orig: number;
  tp_orig: number;
  rr_ratio: number;
  decision: string | null;
  realized_pnl: number | null;
  executed: boolean;
  outcome_15m: "SL" | "TP" | "NONE" | "NO_DATA" | "ENTRY_MISMATCH" | "ENTRY_BEYOND_SLTP";
  reached_1r: boolean;
  variant_a: VariantOutcome | null; // null si nunca llegó a +1R (== outcome_15m)
  variant_b: VariantOutcome | null;
  variant_c: VariantOutcome | null;
}

async function simulateSignal(row: SignalRow, horizonMs: number): Promise<SimResult | null> {
  const direction = row.direction;
  const sl = parseFloat(row.grid_sl || row.stopLoss || "0");
  const tp = parseFloat(row.grid_tp || row.takeProfit || "0");
  const entrySignal = row.entry ? parseFloat(row.entry) : NaN;
  if (!sl || !tp || !isFinite(entrySignal)) return null;

  const risk = Math.abs(entrySignal - sl);
  const reward = Math.abs(tp - entrySignal);
  if (risk === 0) return null;
  const rrRatio = reward / risk;
  if (rrRatio < RR_TOLERANCE_LOW || rrRatio > RR_TOLERANCE_HIGH) return null; // filtrado: no es 1:2

  const evaluatedAtMs = new Date(row.evaluated_at).getTime();
  const tfMs = parseTimeframeMs(row.timeframe || "15m");
  const limit = Math.ceil(horizonMs / tfMs) + 5;

  let candles15: Candle[];
  try {
    candles15 = await fetchCandlesCached(row.symbol, row.timeframe || "15m", evaluatedAtMs, limit);
  } catch (e: any) {
    console.error(`  [WARN] sin velas 15m de ${row.symbol} (señal ${row.id}): ${e.message}`);
    return null;
  }
  const forward = candles15.filter((c) => c[0] > evaluatedAtMs);
  if (forward.length === 0) return null;

  const entryPrice = forward[0][1];
  if (isFinite(entrySignal) && entrySignal > 0) {
    const mismatchPct = (Math.abs(entryPrice - entrySignal) / entrySignal) * 100;
    if (mismatchPct > ENTRY_MISMATCH_GUARDRAIL_PCT) return null;
  }

  // Guardrail crítico: si para cuando se simula la entrada (open de la vela siguiente)
  // el precio YA cruzó el SL o el TP originales (calculados una sola vez sobre el precio
  // de la señal), el retorno %calculado contra ese SL/TP ya no tiene sentido — puede dar
  // incluso signo invertido (un "SL" con retorno positivo), porque el SL/TP quedó del lado
  // equivocado de la entrada real. Se excluye en vez de aproximar, para no inventar un
  // precio de salida. Hallazgo de la revisión del 2026-10-01: ~48% de las señales de este
  // dataset caen acá, varias por más de 1R — el delay de "vela siguiente" (hasta 15 min)
  // alcanza para que el precio recorra el stop completo en varios altcoins volátiles.
  const entryBeyondSlTp =
    direction === "LONG" ? entryPrice <= sl || entryPrice >= tp : entryPrice >= sl || entryPrice <= tp;
  if (entryBeyondSlTp) {
    return {
      signal_id: row.id, symbol: row.symbol, direction, strategy: row.strategy, regime: row.regime,
      evaluated_at: row.evaluated_at, entry_price: entryPrice, risk, sl_orig: sl, tp_orig: tp, rr_ratio: rrRatio,
      decision: row.decision, realized_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : null, executed: false,
      outcome_15m: "ENTRY_BEYOND_SLTP", reached_1r: false, variant_a: null, variant_b: null, variant_c: null,
    };
  }

  const executed = !!(row.decision && row.decision.startsWith("Tomada") && row.realized_pnl !== null);

  // Fase 1 (15m): escanear hasta cierre original Y hasta primer toque de +1R, lo que venga.
  const r1Price = direction === "LONG" ? entryPrice + risk : entryPrice - risk;
  let outcome15: "SL" | "TP" | "NONE" = "NONE";
  let closeIdx15 = -1;
  let r1Idx15 = -1;
  for (let i = 0; i < forward.length; i++) {
    const [ts, , high, low] = forward[i];
    if (ts - forward[0][0] > horizonMs) break;
    const slHit = direction === "LONG" ? low <= sl : high >= sl;
    const tpHit = direction === "LONG" ? high >= tp : low <= tp;
    const r1Hit = direction === "LONG" ? high >= r1Price : low <= r1Price;
    if (r1Idx15 === -1 && r1Hit) r1Idx15 = i;
    if (closeIdx15 === -1 && (slHit || tpHit)) {
      closeIdx15 = i;
      outcome15 = slHit ? "SL" : "TP"; // mismo tie-break que analyze.ts (SL primero)
      break; // una vez cerrado a 15m, no hace falta seguir (r1 ya se habría visto antes o en esta vela)
    }
  }
  if (closeIdx15 === -1 && r1Idx15 !== -1) {
    // r1 tocado pero el horizonte se acabó sin cerrar SL/TP original: seguimos igual, no_data en el borde.
  }

  if (r1Idx15 === -1) {
    // Nunca llegó a +1R dentro del horizonte: las 3 variantes son idénticas.
    return {
      signal_id: row.id, symbol: row.symbol, direction, strategy: row.strategy, regime: row.regime,
      evaluated_at: row.evaluated_at, entry_price: entryPrice, risk, sl_orig: sl, tp_orig: tp, rr_ratio: rrRatio,
      decision: row.decision, realized_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : null, executed,
      outcome_15m: closeIdx15 === -1 ? "NONE" : outcome15,
      reached_1r: false, variant_a: null, variant_b: null, variant_c: null,
    };
  }

  // Fase 2 (1m): desde el open de la vela 15m donde se tocó +1R, en adelante.
  // Se pagina de a 1500 velas y se corta apenas las 3 variantes cierran, para no
  // traer el horizonte completo (168h) cuando el trade cierra en minutos/horas.
  const windowStartMs = forward[r1Idx15][0];
  const safetyLimitMs = horizonMs + 24 * 60 * 60_000; // tope de seguridad, igual que antes

  interface VState {
    newSlPrice: number | null;
    r1Touched: boolean;
    activeSl: number;
    closed: boolean;
    ambiguous: boolean;
    firstTouch: "SL" | "TP" | "NONE";
    exitWorst: number | null;
    exitBest: number | null;
    closeTs: number | null;
  }
  function freshState(newSlPrice: number | null): VState {
    return { newSlPrice, r1Touched: newSlPrice === null, activeSl: sl, closed: false, ambiguous: false, firstTouch: "NONE", exitWorst: null, exitBest: null, closeTs: null };
  }
  function stepVariant(st: VState, ts: number, high: number, low: number) {
    if (st.closed) return;
    if (!st.r1Touched) {
      const r1Hit = direction === "LONG" ? high >= r1Price : low <= r1Price;
      if (r1Hit) { st.r1Touched = true; st.activeSl = st.newSlPrice as number; }
    }
    const effectiveSl = st.r1Touched ? (st.newSlPrice === null ? sl : st.activeSl) : sl;
    const slHit = direction === "LONG" ? low <= effectiveSl : high >= effectiveSl;
    const tpHit = direction === "LONG" ? high >= tp : low <= tp;
    if (slHit && tpHit) {
      st.closed = true; st.ambiguous = true; st.firstTouch = "SL";
      st.exitWorst = effectiveSl; st.exitBest = tp; st.closeTs = ts;
    } else if (slHit) {
      st.closed = true; st.firstTouch = "SL";
      st.exitWorst = effectiveSl; st.exitBest = effectiveSl; st.closeTs = ts;
    } else if (tpHit) {
      st.closed = true; st.firstTouch = "TP";
      st.exitWorst = tp; st.exitBest = tp; st.closeTs = ts;
    }
  }
  function toOutcome(st: VState): VariantOutcome {
    return {
      first_touch: st.firstTouch, ambiguous_1m: st.ambiguous,
      exit_price_worst: st.exitWorst, exit_price_best: st.exitBest,
      time_to_close_minutes: st.closeTs !== null ? (st.closeTs + 60_000 - windowStartMs) / 60_000 : null,
    };
  }

  const breakevenExact = entryPrice;
  const breakevenFee = direction === "LONG" ? entryPrice * (1 + ROUND_TRIP_FEE) : entryPrice * (1 - ROUND_TRIP_FEE);
  const stA = freshState(null);
  const stB = freshState(breakevenExact);
  const stC = freshState(breakevenFee);

  let cursor = windowStartMs;
  let guard = 0;
  outer: while (cursor < windowStartMs + safetyLimitMs && guard < 200) {
    guard++;
    let page: Candle[];
    try {
      page = await fetchCandlesCached(row.symbol, "1m", cursor, 1500);
    } catch (e: any) {
      console.error(`  [WARN] sin velas 1m de ${row.symbol} (señal ${row.id}): ${e.message}`);
      break;
    }
    if (!page || page.length === 0) break;
    for (const [ts, , high, low] of page) {
      if (ts < windowStartMs) continue;
      if (ts - windowStartMs > safetyLimitMs) break outer;
      stepVariant(stA, ts, high, low);
      stepVariant(stB, ts, high, low);
      stepVariant(stC, ts, high, low);
      if (stA.closed && stB.closed && stC.closed) break outer;
    }
    const lastTs = page[page.length - 1][0];
    if (lastTs <= cursor) break;
    cursor = lastTs + 60_000;
    if (page.length < 1500) break; // no hay más datos (llegamos al presente)
  }

  const variantA = toOutcome(stA);
  const variantB = toOutcome(stB);
  const variantC = toOutcome(stC);

  return {
    signal_id: row.id, symbol: row.symbol, direction, strategy: row.strategy, regime: row.regime,
    evaluated_at: row.evaluated_at, entry_price: entryPrice, risk, sl_orig: sl, tp_orig: tp, rr_ratio: rrRatio,
    decision: row.decision, realized_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : null, executed,
    outcome_15m: closeIdx15 === -1 ? "NONE" : outcome15,
    reached_1r: true, variant_a: variantA, variant_b: variantB, variant_c: variantC,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const horizonHours = parseInt(args.find((a) => a.startsWith("--horizon-hours="))?.split("=")[1] || "168", 10);
  const horizonMs = horizonHours * 60 * 60_000;

  console.log(`Backtest de breakeven a +1R, horizonte ${horizonHours}h. Fuente: klines públicos de Binance Futures (sin claves).`);

  const rows = (await queryAnalytics<SignalRow>(
    `SELECT id, symbol, timeframe, evaluated_at, direction, entry, "stopLoss", "takeProfit", grid_sl, grid_tp, decision, realized_pnl, executed_entry_price, strategy, regime
     FROM signal_history
     WHERE direction IS NOT NULL
     ORDER BY evaluated_at ASC;`
  )) as SignalRow[];
  console.log(`Señales en signal_history: ${rows.length}`);

  const results: SimResult[] = [];
  let excludedNotAvailable = 0;
  const ratioHistogram: Record<string, number> = {};

  let i = 0;
  for (const row of rows) {
    i++;
    process.stdout.write(`\r  Simulando ${i}/${rows.length} (${row.symbol})...`);
    const sl = parseFloat(row.grid_sl || row.stopLoss || "0");
    const tp = parseFloat(row.grid_tp || row.takeProfit || "0");
    const entry = row.entry ? parseFloat(row.entry) : NaN;
    if (sl && tp && isFinite(entry) && entry > 0) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk > 0) {
        const ratio = reward / risk;
        const bucket = ratio < 1.5 ? "~1:1" : ratio > 2.5 ? ">1:2.5" : ratio < RR_TOLERANCE_LOW || ratio > RR_TOLERANCE_HIGH ? "otro" : "1:2";
        ratioHistogram[bucket] = (ratioHistogram[bucket] || 0) + 1;
      }
    }
    const r = await simulateSignal(row, horizonMs);
    if (r === null) {
      excludedNotAvailable++;
      continue;
    }
    results.push(r);
  }
  console.log("");

  console.log(`\nSeñales excluidas por R:R fuera de 1:2 (o datos faltantes/NO_DATA/mismatch): ver detalle abajo.`);
  console.log(`Histograma de ratio beneficio/riesgo (sobre señales con SL/TP/entry válidos):`);
  for (const [bucket, count] of Object.entries(ratioHistogram)) {
    console.log(`  ${bucket}: ${count}`);
  }
  const beyondSlTp = results.filter((r) => r.outcome_15m === "ENTRY_BEYOND_SLTP").length;
  const simulable = results.filter((r) => r.outcome_15m !== "ENTRY_BEYOND_SLTP");
  console.log(`Simuladas con éxito (R:R 1:2 confirmado, con datos de velas): ${results.length}`);
  console.log(`Excluidas antes de simular (sin datos de velas, ratio fuera de rango, o SL/TP/entry inválidos): ${excludedNotAvailable}`);
  console.log(`De las simuladas, excluidas por entrada ya más allá del SL/TP original al abrir la vela siguiente (ENTRY_BEYOND_SLTP): ${beyondSlTp}`);
  console.log(`Simulables de verdad (SL/TP original todavía vigente al entrar): ${simulable.length}`);
  console.log(`De las simulables, llegaron a tocar +1R: ${simulable.filter((r) => r.reached_1r).length}`);

  mkdirSync("data_dl", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `data_dl/breakeven_backtest_${stamp}.json`;
  writeFileSync(outPath, JSON.stringify({ ratioHistogram, results }, null, 2));
  console.log(`Resultados guardados en ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  });
