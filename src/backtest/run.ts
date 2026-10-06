// Runner del backtest: corre un grupo de estrategias (presets.ts) sobre el universo
// point-in-time y guarda trades, equity y métricas en data_dl/backtests/.
//
// Protección del holdout: por defecto NO simula nada posterior a HOLDOUT_START. El tramo
// reservado se usa una sola vez, al final, con --holdout (docs §8.5).
//
// Correr: npx tsx src/backtest/run.ts --preset=T1 [--from=2021-01-01] [--to=2025-10-01] [--cost=1|2]
//         [--equity=300] [--margin=6] [--lev-min=1] [--lev-max=10] [--max-positions=5]
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { BACKTESTS_DIR } from "./data/paths.js";
import { DEFAULT_SIM_CONFIG, type SimConfig, type SimResult } from "./engine/types.js";
import { computeMetrics, type Metrics } from "./metrics.js";
import { PRESETS } from "./presets.js";
import { HOLDOUT_START } from "./holdout.js";
import { loadUniverse, groupByTimeframe, makeRunner } from "./context.js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function parseDate(s: string): number {
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Fecha inválida: ${s}`);
  return t;
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : String(n);
}

function writeOutputs(dir: string, result: SimResult, metrics: Metrics) {
  mkdirSync(dir, { recursive: true });
  const header = "instrument,side,rank,entryTime,entryPrice,initialStop,exitTime,exitPrice,exitReason,ambiguous,leverage,notional,grossPnl,fees,funding,netPnl,rMultiple,barsHeld";
  const rows = result.trades.map((t) =>
    [t.instrument, t.side, t.rankAtEntry, new Date(t.entryTime).toISOString(), t.entryPrice, t.initialStop, new Date(t.exitTime).toISOString(), t.exitPrice, t.exitReason, t.ambiguous, t.leverage, fmt(t.notional), fmt(t.grossPnl, 4), fmt(t.fees, 4), fmt(t.funding, 4), fmt(t.netPnl, 4), fmt(t.rMultiple, 3), t.barsHeld].join(",")
  );
  writeFileSync(join(dir, "trades.csv"), [header, ...rows].join("\n"));
  writeFileSync(join(dir, "equity.csv"), ["date,equity,openPositions", ...result.equity.map((e) => `${new Date(e.date).toISOString().slice(0, 10)},${fmt(e.equity)},${e.openPositions}`)].join("\n"));
  writeFileSync(join(dir, "metrics.json"), JSON.stringify({ strategyId: result.strategyId, config: result.config, metrics }, null, 2));
}

async function main() {
  const presetName = arg("preset");
  if (!presetName || !PRESETS[presetName]) throw new Error(`Falta --preset=<${Object.keys(PRESETS).join("|")}>`);
  const from = parseDate(arg("from") ?? "2021-01-01");
  const to = parseDate(arg("to") ?? "2025-10-01");
  const useHoldout = process.argv.includes("--holdout");
  if (to > HOLDOUT_START && !useHoldout) {
    throw new Error(`--to pasa el inicio del holdout (${new Date(HOLDOUT_START).toISOString().slice(0, 10)}). Ese tramo se usa una sola vez al final: pasá --holdout explícitamente.`);
  }

  const universe = loadUniverse();

  const cfg: SimConfig = {
    ...DEFAULT_SIM_CONFIG,
    start: from,
    end: to,
    costMultiplier: Number(arg("cost") ?? 1),
    initialEquity: Number(arg("equity") ?? DEFAULT_SIM_CONFIG.initialEquity),
    marginPerTrade: Number(arg("margin") ?? DEFAULT_SIM_CONFIG.marginPerTrade),
    leverageMin: Number(arg("lev-min") ?? DEFAULT_SIM_CONFIG.leverageMin),
    leverageMax: Number(arg("lev-max") ?? DEFAULT_SIM_CONFIG.leverageMax),
    maxPositions: Number(arg("max-positions") ?? DEFAULT_SIM_CONFIG.maxPositions),
  };
  console.log(`Capital ${cfg.initialEquity} USDT | margen ${cfg.marginPerTrade} | x${cfg.leverageMin}–x${cfg.leverageMax} | máx. ${cfg.maxPositions} posiciones | costos ×${cfg.costMultiplier}`);

  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const [tfHours, group] of groupByTimeframe(PRESETS[presetName]())) {
    const runStrategy = makeRunner(universe, tfHours, from, to, group);

    for (const strategy of group) {
      const t0 = Date.now();
      const result = runStrategy(strategy, cfg);
      const m = computeMetrics(result);
      const dir = join(BACKTESTS_DIR, `${runStamp}_${presetName}`, `${strategy.id}_cost${cfg.costMultiplier}`);
      writeOutputs(dir, result, m);
      mkdirSync(BACKTESTS_DIR, { recursive: true });
      appendFileSync(
        join(BACKTESTS_DIR, "registry.jsonl"),
        JSON.stringify({
          at: new Date().toISOString(),
          preset: presetName,
          strategyId: strategy.id,
          family: strategy.family,
          from: new Date(from).toISOString().slice(0, 10),
          to: new Date(to).toISOString().slice(0, 10),
          holdout: useHoldout,
          costMultiplier: cfg.costMultiplier,
          maxPositions: cfg.maxPositions,
          initialEquity: cfg.initialEquity,
          marginPerTrade: cfg.marginPerTrade,
          leverageRange: [cfg.leverageMin, cfg.leverageMax],
          trades: m.trades,
          sharpe: m.sharpe,
          expectancyR: m.expectancyR,
          profitFactor: m.profitFactor,
          maxDrawdownPct: m.maxDrawdownPct,
          annualReturnPct: m.annualReturnPct,
          dir,
        }) + "\n"
      );
      console.log(
        `${strategy.id.padEnd(48)} trades ${String(m.trades).padStart(5)} | win ${fmt(m.winRate * 100, 1)}% | E[R] ${fmt(m.expectancyR, 3)} | PF ${fmt(m.profitFactor)} | ` +
          `anual ${fmt(m.annualReturnPct, 1)}% | MDD ${fmt(m.maxDrawdownPct, 1)}% | Sharpe ${fmt(m.sharpe)} | funding ${fmt(m.fundingPnl)} | amb ${fmt(m.ambiguousPct, 1)}% | sin cupo ${m.skippedNoSlot} | Regla 1 ${m.skippedMinNotional} (${((Date.now() - t0) / 1000).toFixed(0)}s)`
      );
    }
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
