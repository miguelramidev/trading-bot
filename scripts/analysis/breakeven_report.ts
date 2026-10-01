// Arma el informe de la auditoría de breakeven a +1R a partir del JSON que
// genera scripts/analysis/breakeven_backtest.ts. No toca la red ni la base,
// solo lee el archivo de resultados más reciente en data_dl/. Excluye del
// análisis las señales marcadas "ENTRY_BEYOND_SLTP" (ver el guardrail en
// breakeven_backtest.ts) y valida la variante base contra el resultado real
// de las señales ejecutadas antes de reportar nada más.
//
// Correr: npx tsx scripts/analysis/breakeven_report.ts [ruta_al_json]

import { readFileSync, readdirSync } from "node:fs";

const ROUND_TRIP_FEE = 0.001; // 0.10%, igual que el backtest
const CUTOFF_DATE = "2026-09-22";

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
  risk: number;
  sl_orig: number;
  tp_orig: number;
  rr_ratio: number;
  decision: string | null;
  realized_pnl: number | null;
  executed: boolean;
  outcome_15m: "SL" | "TP" | "NONE" | "NO_DATA" | "ENTRY_MISMATCH" | "ENTRY_BEYOND_SLTP";
  reached_1r: boolean;
  variant_a: VariantOutcome | null;
  variant_b: VariantOutcome | null;
  variant_c: VariantOutcome | null;
}

function netReturnPct(direction: string, entry: number, exit: number): number {
  const gross = direction === "LONG" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
  return gross - ROUND_TRIP_FEE * 100;
}

// Devuelve [retorno_peor_caso, retorno_mejor_caso, cerro_en_breakeven, ambiguo] o null si no cerró (NONE/NO_DATA/ENTRY_MISMATCH).
function resolveVariant(r: SimResult, variant: "a" | "b" | "c"): { worst: number; best: number; ambiguous: boolean; closedAtBreakeven: boolean } | null {
  if (!r.reached_1r) {
    // Nunca tocó +1R: las 3 variantes son idénticas al resultado original a 15m.
    if (r.outcome_15m !== "SL" && r.outcome_15m !== "TP") return null;
    const exit = r.outcome_15m === "SL" ? r.sl_orig : r.tp_orig;
    const ret = netReturnPct(r.direction, r.entry_price, exit);
    return { worst: ret, best: ret, ambiguous: false, closedAtBreakeven: false };
  }
  const v = variant === "a" ? r.variant_a : variant === "b" ? r.variant_b : r.variant_c;
  if (!v || v.first_touch === "NONE" || v.exit_price_worst === null || v.exit_price_best === null) return null;
  const worst = netReturnPct(r.direction, r.entry_price, v.exit_price_worst);
  const best = netReturnPct(r.direction, r.entry_price, v.exit_price_best);
  // "Cerró en breakeven" solo aplica a b/c, y solo cuando el cierre fue vía el SL nuevo (no el TP original).
  const closedAtBreakeven = variant !== "a" && v.first_touch === "SL";
  return { worst, best, ambiguous: v.ambiguous_1m, closedAtBreakeven };
}

function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const phat = wins / n;
  const denom = 1 + (z * z) / n;
  const center = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (center - margin) / denom), Math.min(1, (center + margin) / denom)];
}

function maxDrawdown(returnsOrdered: number[]): number {
  let cum = 0, peak = 0, maxDd = 0;
  for (const r of returnsOrdered) {
    cum += r;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

interface VariantStats {
  n: number;
  wins: number;
  winRateCI: [number, number];
  meanReturnPct: number;
  profitFactor: number | null;
  maxDrawdownPct: number;
  closedAtBreakeven: number;
  ambiguousCount: number;
  noCloseExcluded: number;
}

function computeStats(results: SimResult[], variant: "a" | "b" | "c", useWorstCase: boolean): VariantStats {
  const sorted = [...results].sort((x, y) => new Date(x.evaluated_at).getTime() - new Date(y.evaluated_at).getTime());
  const returns: number[] = [];
  let wins = 0, closedAtBreakeven = 0, ambiguousCount = 0, noCloseExcluded = 0;
  for (const r of sorted) {
    const resolved = resolveVariant(r, variant);
    if (!resolved) { noCloseExcluded++; continue; }
    const ret = useWorstCase ? resolved.worst : resolved.best;
    returns.push(ret);
    if (ret > 0) wins++;
    if (resolved.closedAtBreakeven) closedAtBreakeven++;
    if (resolved.ambiguous) ambiguousCount++;
  }
  const positive = returns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const negative = Math.abs(returns.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  return {
    n: returns.length,
    wins,
    winRateCI: wilson(wins, returns.length),
    meanReturnPct: mean(returns),
    profitFactor: negative === 0 ? null : positive / negative,
    maxDrawdownPct: maxDrawdown(returns),
    closedAtBreakeven,
    ambiguousCount,
    noCloseExcluded,
  };
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function fmtNum(x: number): string {
  return x.toFixed(3);
}

function printVariantRow(label: string, stats: VariantStats) {
  const wr = stats.n > 0 ? (stats.wins / stats.n) : 0;
  const pf = stats.profitFactor === null ? "∞ (sin pérdidas)" : stats.profitFactor.toFixed(2);
  const concl = stats.n < 20 ? "  [N<20: NO CONCLUYENTE]" : stats.n <= 50 ? "  [N 20-50: muestra chica]" : "";
  console.log(
    `  ${label.padEnd(10)} N=${String(stats.n).padEnd(5)} winrate=${fmtPct(wr)} IC95%[${fmtPct(stats.winRateCI[0])},${fmtPct(stats.winRateCI[1])}]` +
    ` retorno_medio=${fmtNum(stats.meanReturnPct)}% PF=${pf} maxDD=${fmtNum(stats.maxDrawdownPct)}%` +
    ` cierres_breakeven=${stats.closedAtBreakeven} ambiguos_1m=${stats.ambiguousCount} sin_cierre=${stats.noCloseExcluded}${concl}`
  );
}

function reportSegment(title: string, results: SimResult[]) {
  console.log(`\n--- ${title} (N total=${results.length}) ---`);
  if (results.length === 0) { console.log("  (sin señales en este corte)"); return; }
  for (const caseLabel of ["peor caso", "mejor caso"] as const) {
    const worst = caseLabel === "peor caso";
    console.log(` [${caseLabel}]`);
    printVariantRow("a (base)", computeStats(results, "a", worst));
    printVariantRow("b (entrada)", computeStats(results, "b", worst));
    printVariantRow("c (entrada+fee)", computeStats(results, "c", worst));
  }
}

function costBenefit(results: SimResult[], variant: "b" | "c") {
  const reached = results.filter((r) => r.reached_1r);
  let avoidedLossCount = 0, avoidedLossSum = 0;
  let cutGainCount = 0, cutGainSum = 0;
  let ambiguousInvolved = 0;
  for (const r of reached) {
    const a = resolveVariant(r, "a");
    const v = resolveVariant(r, variant);
    if (!a || !v) continue;
    if (v.ambiguous || a.ambiguous) ambiguousInvolved++;
    // Usamos el caso "peor" de cada uno para una lectura conservadora del costo/beneficio.
    if (a.worst < 0 && v.closedAtBreakeven) {
      avoidedLossCount++;
      avoidedLossSum += (v.worst - a.worst); // diferencia a favor
    } else if (a.worst > 0 && a.worst === a.best && v.closedAtBreakeven) {
      // 'a' terminó en TP (ganancia completa) pero la variante con breakeven cortó antes.
      cutGainCount++;
      cutGainSum += (a.worst - v.worst);
    }
  }
  console.log(`\n--- Costo/beneficio variante ${variant} (sobre señales que tocaron +1R, N=${reached.length}) ---`);
  console.log(`  Pérdidas evitadas: ${avoidedLossCount} casos, +${avoidedLossSum.toFixed(3)}% acumulado (vs. variante base)` + (avoidedLossCount > 0 ? `, promedio ${(avoidedLossSum / avoidedLossCount).toFixed(3)}%/caso` : ""));
  console.log(`  Ganancias cortadas: ${cutGainCount} casos, -${cutGainSum.toFixed(3)}% acumulado (vs. variante base)` + (cutGainCount > 0 ? `, promedio ${(cutGainSum / cutGainCount).toFixed(3)}%/caso` : ""));
  console.log(`  Casos con ambigüedad a 1m involucrada en el cálculo: ${ambiguousInvolved}`);
  printExamples(results, variant, "avoided_loss", 5);
  printExamples(results, variant, "cut_gain", 5);
}

function extractRealFirstTouch(decision: string | null): "SL" | "TP" | null {
  if (!decision) return null;
  if (decision.includes("SL Tocado")) return "SL";
  if (decision.includes("TP Tocado")) return "TP";
  return null;
}

function simulatedFirstTouch(r: SimResult): "SL" | "TP" | "NONE" {
  if (r.reached_1r) return r.variant_a!.first_touch;
  return r.outcome_15m === "SL" || r.outcome_15m === "TP" ? r.outcome_15m : "NONE";
}

// Compara el resultado simulado (variante base) contra el real para las señales
// EJECUTADAS, señal por señal — exactamente lo que valida (o no) esta nueva corrida.
function validateAgainstReal(executed: SimResult[]) {
  let matches = 0, total = 0, realTP = 0, realSL = 0, simTP = 0, simSL = 0;
  const mismatches: SimResult[] = [];
  for (const r of executed) {
    const real = extractRealFirstTouch(r.decision);
    if (!real) continue;
    total++;
    const sim = simulatedFirstTouch(r);
    if (sim === real) matches++; else mismatches.push(r);
    if (real === "TP") realTP++; else realSL++;
    if (sim === "TP") simTP++; else if (sim === "SL") simSL++;
  }
  console.log(`\n--- Validación contra resultado real (ejecutadas, N=${total}) ---`);
  console.log(`  Coincidencias simulado vs. real (first_touch): ${matches}/${total} (${total > 0 ? ((matches / total) * 100).toFixed(1) : "0.0"}%)`);
  console.log(`  Winrate REAL: ${(realTP / (realTP + realSL) * 100).toFixed(1)}% (TP=${realTP}, SL=${realSL})`);
  console.log(`  Winrate SIMULADO (variante base): ${(simTP / (simTP + simSL) * 100).toFixed(1)}% (TP=${simTP}, SL=${simSL})`);
  if (mismatches.length > 0) {
    console.log(`  Desacuerdos (${mismatches.length}):`);
    for (const m of mismatches) {
      console.log(`    señal ${m.signal_id} (${m.symbol}, ${m.direction}): real=${extractRealFirstTouch(m.decision)} simulado=${simulatedFirstTouch(m)}`);
    }
  }
}

function printExamples(results: SimResult[], variant: "b" | "c", kind: "avoided_loss" | "cut_gain", count: number) {
  const reached = results.filter((r) => r.reached_1r);
  const examples: { r: SimResult; a: NonNullable<ReturnType<typeof resolveVariant>>; v: NonNullable<ReturnType<typeof resolveVariant>> }[] = [];
  for (const r of reached) {
    const a = resolveVariant(r, "a");
    const v = resolveVariant(r, variant);
    if (!a || !v) continue;
    if (kind === "avoided_loss" && a.worst < 0 && v.closedAtBreakeven) examples.push({ r, a, v });
    else if (kind === "cut_gain" && a.worst > 0 && a.worst === a.best && v.closedAtBreakeven) examples.push({ r, a, v });
  }
  console.log(`\n  Ejemplos de "${kind === "avoided_loss" ? "pérdida evitada" : "ganancia cortada"}" (variante ${variant}), hasta ${count} de ${examples.length}:`);
  for (const ex of examples.slice(0, count)) {
    const r = ex.r;
    const vOutcome = variant === "b" ? r.variant_b! : r.variant_c!;
    console.log(
      `    señal ${r.signal_id} (${r.symbol}, ${r.direction}): entry=${r.entry_price} SL=${r.sl_orig} TP=${r.tp_orig} riesgo(1R)=${r.risk.toFixed(6)}` +
      ` | tiempos medidos en minutos desde el open de la vela de 15m donde se tocó +1R` +
      ` | base: ${ex.a.worst.toFixed(3)}% (cerró ${r.variant_a!.first_touch} a los ${r.variant_a!.time_to_close_minutes?.toFixed(0)}min)` +
      ` | con_regla: ${ex.v.worst.toFixed(3)}% (cerró ${vOutcome.first_touch} a los ${vOutcome.time_to_close_minutes?.toFixed(0)}min)`
    );
  }
}

function main() {
  const argPath = process.argv[2];
  let path = argPath;
  if (!path) {
    const files = readdirSync("data_dl").filter((f) => f.startsWith("breakeven_backtest_") && f.endsWith(".json")).sort();
    if (files.length === 0) throw new Error("No hay archivos breakeven_backtest_*.json en data_dl/. Correr primero scratch/breakeven_backtest.ts.");
    path = `data_dl/${files[files.length - 1]}`;
  }
  console.log(`Leyendo ${path}`);
  const data = JSON.parse(readFileSync(path, "utf8"));
  const allResults: SimResult[] = data.results;
  const excludedBeyond = allResults.filter((r) => r.outcome_15m === "ENTRY_BEYOND_SLTP");
  const results: SimResult[] = allResults.filter((r) => r.outcome_15m !== "ENTRY_BEYOND_SLTP");
  console.log(`\nExcluidas por ENTRY_BEYOND_SLTP (entrada ya más allá del SL/TP original al abrir la vela siguiente): ${excludedBeyond.length}/${allResults.length}`);
  console.log(`Simulables de verdad: ${results.length}`);

  validateAgainstReal(results.filter((r) => r.executed));

  const dates = results.map((r) => new Date(r.evaluated_at).getTime()).sort((a, b) => a - b);
  const minDate = new Date(dates[0]).toISOString();
  const maxDate = new Date(dates[dates.length - 1]).toISOString();
  const distinctDays = new Set(results.map((r) => r.evaluated_at.slice(0, 10))).size;
  console.log(`\nCobertura: ${minDate} a ${maxDate} (${distinctDays} días de mercado distintos, ${results.length} señales con R:R 1:2 confirmado)`);
  console.log(`Aclaración: retorno neto de comisiones de trading (0.10% ida y vuelta estimado), no incluye funding. "Peor caso"/"mejor caso" solo difieren donde hubo ambigüedad a 1 minuto.`);

  const reached1r = results.filter((r) => r.reached_1r);
  console.log(`\nSeñales que tocaron +1R (donde las 3 variantes pueden diferir): ${reached1r.length}/${results.length}`);
  const totalAmbiguous = reached1r.filter((r) => r.variant_a?.ambiguous_1m || r.variant_b?.ambiguous_1m || r.variant_c?.ambiguous_1m).length;
  console.log(`De esas, con ambigüedad a 1 minuto en alguna variante: ${totalAmbiguous}`);

  reportSegment("TODAS las señales (calidad de estrategia)", results);
  reportSegment("Solo EJECUTADAS (decision LIKE 'Tomada%')", results.filter((r) => r.executed));

  const mid = dates[Math.floor(dates.length / 2)];
  reportSegment("Primera mitad (para mirar)", results.filter((r) => new Date(r.evaluated_at).getTime() < mid));
  reportSegment("Segunda mitad (para validar)", results.filter((r) => new Date(r.evaluated_at).getTime() >= mid));

  reportSegment(`Sin el ${CUTOFF_DATE}`, results.filter((r) => !r.evaluated_at.startsWith(CUTOFF_DATE)));
  reportSegment(`Solo el ${CUTOFF_DATE}`, results.filter((r) => r.evaluated_at.startsWith(CUTOFF_DATE)));

  const strategies = Array.from(new Set(results.map((r) => r.strategy || "desconocida"))).sort();
  for (const s of strategies) {
    reportSegment(`Estrategia ${s}`, results.filter((r) => (r.strategy || "desconocida") === s));
  }

  costBenefit(results, "b");
  costBenefit(results, "c");
}

main();
