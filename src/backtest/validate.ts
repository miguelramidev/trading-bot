// Validación fuera de muestra de un pool pre-registrado de variantes (presets.ts, LONG_WF / SHORT_WF).
//
//   1. Cada variante sobre el período completo pre-holdout, con costos ×1 y ×2.
//   2. Walk-forward con re-selección: en cada paso se elige la variante con mejor Sharpe en los 24
//      meses previos (in-sample) y se mide en los 6 siguientes (out-of-sample). La curva OOS
//      concatenada mide si el PROCESO de elegir funciona, no si una variante tuvo suerte.
//      Aproximación: los tramos se cortan de la curva diaria de una corrida continua (con margen
//      fijo los PnL diarios no dependen del capital acumulado; sí puede cambiar qué posiciones había
//      abiertas al empezar cada tramo).
//   3. Deflated Sharpe contra la cantidad de variantes distintas probadas (registry.jsonl).
//   4. Monte Carlo por bloques del drawdown (percentil 95 contra el 25 % tolerado).
//
// Correr: npx tsx src/backtest/validate.ts --preset=LONG_WF [--from=2021-01-01] [--to=2025-10-01]
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BACKTESTS_DIR } from "./data/paths.js";
import { simulate } from "./engine/simulate.js";
import { DEFAULT_SIM_CONFIG, type SimConfig, type DailyEquity } from "./engine/types.js";
import { computeMetrics, maxDrawdownPct } from "./metrics.js";
import { PRESETS } from "./presets.js";
import { HOLDOUT_START } from "./holdout.js";
import { loadUniverse, loadMarket, groupByTimeframe } from "./context.js";
import { deflatedSharpe, bootstrapMaxDrawdown, moments } from "./stats.js";

const IS_MONTHS = 24;
const OOS_MONTHS = 6;
const MAX_DRAWDOWN_TOLERATED = 25;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function addMonths(t: number, months: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
}

/** PnL diario en USDT a partir de la curva de equity (margen fijo: los días se pueden sumar). */
function dailyPnl(equity: DailyEquity[]): { date: number; pnl: number }[] {
  const out: { date: number; pnl: number }[] = [];
  for (let k = 1; k < equity.length; k++) out.push({ date: equity[k].date, pnl: equity[k].equity - equity[k - 1].equity });
  return out;
}

function sharpeAnnual(pnl: number[]): number {
  const m = moments(pnl);
  return m.std > 0 ? (m.mean / m.std) * Math.sqrt(365) : 0;
}

function curveStats(pnl: number[], initialEquity: number) {
  const eq = [initialEquity];
  for (const p of pnl) eq.push(eq[eq.length - 1] + p);
  const total = pnl.reduce((a, b) => a + b, 0);
  return {
    sharpe: sharpeAnnual(pnl),
    annualPct: ((total / initialEquity) * 100) / (pnl.length / 365),
    mddPct: maxDrawdownPct(eq),
  };
}

/** Variantes distintas probadas hasta ahora (sin contar repeticiones por capital o costos) y la varianza de su SR diario. */
function trialStats(extraSharpes: { id: string; sharpe: number }[]): { n: number; srVariance: number } {
  const byId = new Map<string, number>();
  const path = join(BACKTESTS_DIR, "registry.jsonl");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.holdout) continue;
      // Para la varianza se usa la corrida con costos ×1 del capital vigente si existe.
      if (!byId.has(r.strategyId) || (r.costMultiplier === 1 && r.initialEquity === DEFAULT_SIM_CONFIG.initialEquity)) byId.set(r.strategyId, r.sharpe);
    }
  }
  for (const e of extraSharpes) byId.set(e.id, e.sharpe);
  const daily = [...byId.values()].filter(Number.isFinite).map((s) => s / Math.sqrt(365));
  const m = moments(daily);
  return { n: byId.size + PRIOR_LOST_TRIALS, srVariance: m.std * m.std };
}

/**
 * Variantes de la tanda 4h/1d del 2026-10-05 (docs §14) que no están en el registry.jsonl actual:
 * ese registro vivía en data_dl/ y se perdió al rehacer los datos. Se prueban sobre los mismos
 * años, así que siguen contando para el Deflated Sharpe.
 */
const PRIOR_LOST_TRIALS = 44;

async function main() {
  const presetName = arg("preset");
  if (!presetName || !PRESETS[presetName]) throw new Error(`Falta --preset=<${Object.keys(PRESETS).join("|")}>`);
  const from = Date.parse(`${arg("from") ?? "2021-01-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2025-10-01"}T00:00:00Z`);
  if (to > HOLDOUT_START) throw new Error("La validación nunca toca el holdout.");

  const universe = loadUniverse();
  const base: SimConfig = { ...DEFAULT_SIM_CONFIG, start: from, end: to };
  console.log(`Capital ${base.initialEquity} USDT | margen ${base.marginPerTrade} | x${base.leverageMin}–x${base.leverageMax} | máx. ${base.maxPositions} posiciones`);

  const runs: { id: string; pnl: { date: number; pnl: number }[]; cost2: { date: number; pnl: number }[]; trades: number; exTop3: number; net: number }[] = [];
  for (const [tfHours, group] of groupByTimeframe(PRESETS[presetName]())) {
    const { instruments, market } = loadMarket(universe, tfHours, from, to);
    for (const strategy of group) {
      const r1 = simulate(strategy, instruments, market, universe, { ...base, costMultiplier: 1 });
      const r2 = simulate(strategy, instruments, market, universe, { ...base, costMultiplier: 2 });
      const m1 = computeMetrics(r1);
      runs.push({ id: strategy.id, pnl: dailyPnl(r1.equity), cost2: dailyPnl(r2.equity), trades: m1.trades, exTop3: m1.netPnlExTop3, net: m1.netPnl });
      mkdirSync(BACKTESTS_DIR, { recursive: true });
      appendFileSync(
        join(BACKTESTS_DIR, "registry.jsonl"),
        JSON.stringify({ at: new Date().toISOString(), preset: presetName, kind: "validation", strategyId: strategy.id, family: strategy.family, from: arg("from") ?? "2021-01-01", to: arg("to") ?? "2025-10-01", holdout: false, costMultiplier: 1, maxPositions: base.maxPositions, initialEquity: base.initialEquity, trades: m1.trades, sharpe: m1.sharpe, expectancyR: m1.expectancyR, profitFactor: m1.profitFactor, maxDrawdownPct: m1.maxDrawdownPct, annualReturnPct: m1.annualReturnPct }) + "\n"
      );
    }
  }

  // --- Walk-forward con re-selección ---
  const steps: { oosFrom: number; oosTo: number; chosen: string; isSharpe: number; oosPnl: number }[] = [];
  const oosSeries: number[] = [];
  const oosSeriesCost2: number[] = [];
  for (let oosFrom = addMonths(from, IS_MONTHS); oosFrom < to; oosFrom = addMonths(oosFrom, OOS_MONTHS)) {
    const isFrom = addMonths(oosFrom, -IS_MONTHS);
    const oosTo = Math.min(addMonths(oosFrom, OOS_MONTHS), to);
    let best = runs[0];
    let bestSharpe = -Infinity;
    for (const r of runs) {
      const s = sharpeAnnual(r.pnl.filter((d) => d.date >= isFrom && d.date < oosFrom).map((d) => d.pnl));
      if (s > bestSharpe) {
        bestSharpe = s;
        best = r;
      }
    }
    const oos = best.pnl.filter((d) => d.date >= oosFrom && d.date < oosTo).map((d) => d.pnl);
    oosSeries.push(...oos);
    oosSeriesCost2.push(...best.cost2.filter((d) => d.date >= oosFrom && d.date < oosTo).map((d) => d.pnl));
    steps.push({ oosFrom, oosTo, chosen: best.id, isSharpe: bestSharpe, oosPnl: oos.reduce((a, b) => a + b, 0) });
  }

  // --- Reporte por variante (período completo) ---
  const trials = trialStats(runs.map((r) => ({ id: r.id, sharpe: sharpeAnnual(r.pnl.map((d) => d.pnl)) })));
  console.log(`\nVariantes distintas probadas hasta ahora (N para el Deflated Sharpe): ${trials.n}\n`);
  const rows = runs.map((r) => {
    const pnl = r.pnl.map((d) => d.pnl);
    const c1 = curveStats(pnl, base.initialEquity);
    const c2 = curveStats(r.cost2.map((d) => d.pnl), base.initialEquity);
    const mc = bootstrapMaxDrawdown(pnl, base.initialEquity);
    const dsr = deflatedSharpe(pnl.map((p) => p / base.initialEquity), trials.n, trials.srVariance);
    const windows = steps.map((s) => r.pnl.filter((d) => d.date >= s.oosFrom && d.date < s.oosTo).reduce((a, d) => a + d.pnl, 0));
    return { id: r.id, trades: r.trades, ...c1, sharpeCost2: c2.sharpe, annualCost2: c2.annualPct, mcP95: mc.p95, dsr: dsr.dsr, windowsPositive: windows.filter((w) => w > 0).length, windows: windows.length, exTop3Share: r.net !== 0 ? r.exTop3 / r.net : 0 };
  });
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(40)} trades ${String(r.trades).padStart(5)} | Sharpe ${r.sharpe.toFixed(2)} (×2: ${r.sharpeCost2.toFixed(2)}) | anual ${r.annualPct.toFixed(1)}% (×2: ${r.annualCost2.toFixed(1)}%) | ` +
        `MDD ${r.mddPct.toFixed(1)}% (MC p95 ${r.mcP95.toFixed(1)}%) | DSR ${r.dsr.toFixed(2)} | semestres + ${r.windowsPositive}/${r.windows} | sin top3 ${(r.exTop3Share * 100).toFixed(0)}%`
    );
  }

  // --- Walk-forward ---
  const wf1 = curveStats(oosSeries, base.initialEquity);
  const wf2 = curveStats(oosSeriesCost2, base.initialEquity);
  const wfMc = bootstrapMaxDrawdown(oosSeries, base.initialEquity);
  const wfDsr = deflatedSharpe(oosSeries.map((p) => p / base.initialEquity), trials.n, trials.srVariance);
  console.log(`\nWalk-forward (${IS_MONTHS}m in-sample → ${OOS_MONTHS}m out-of-sample, re-seleccionando cada paso):`);
  for (const s of steps) {
    console.log(`  ${new Date(s.oosFrom).toISOString().slice(0, 7)} → ${new Date(s.oosTo).toISOString().slice(0, 7)}: ${s.chosen.padEnd(40)} (Sharpe IS ${s.isSharpe.toFixed(2)}) → PnL OOS ${s.oosPnl >= 0 ? "+" : ""}${s.oosPnl.toFixed(1)} USDT`);
  }
  console.log(
    `  Curva OOS concatenada: Sharpe ${wf1.sharpe.toFixed(2)} (×2: ${wf2.sharpe.toFixed(2)}) | anual ${wf1.annualPct.toFixed(1)}% (×2: ${wf2.annualPct.toFixed(1)}%) | MDD ${wf1.mddPct.toFixed(1)}% | ` +
      `MC p95 ${wfMc.p95.toFixed(1)}% (tolerado ${MAX_DRAWDOWN_TOLERATED}%) | ruina ${wfMc.ruinPct.toFixed(1)}% | DSR ${wfDsr.dsr.toFixed(2)}`
  );

  const out = join(BACKTESTS_DIR, `validation_${presetName}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ preset: presetName, config: base, trials, rows, walkForward: { steps, cost1: wf1, cost2: wf2, monteCarlo: wfMc, dsr: wfDsr } }, null, 2));
  console.log(`\n→ ${out}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
