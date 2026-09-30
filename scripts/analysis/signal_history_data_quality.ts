// Chequeos de calidad de datos reutilizables sobre signal_history:
// cuándo se rompió account_balance, hasta cuándo hay artefactos "Shadow"
// de la feature removida, PnL real por decisión, y densidad de señales
// por día (para detectar días que dominan una muestra antes de segmentar).
// Correr: npx tsx scripts/analysis/signal_history_data_quality.ts
// Ver la skill `auditoria-trades` antes de interpretar los resultados.
import { queryAnalytics } from "./lib/analyticsDb.js";

async function run(label: string, query: string) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(await queryAnalytics(query), null, 2));
}

async function main() {
  await run("account_balance: ¿0.00 fijo, y desde cuándo? (roto desde el 2026-09-25, commit eff06ec)", `
    SELECT (account_balance = '0.00') AS balance_cero, MIN(evaluated_at) AS desde, MAX(evaluated_at) AS hasta, COUNT(*) AS n
    FROM signal_history GROUP BY 1;
  `);

  await run("Artefactos 'Shadow' (feature removida): rango de fechas", `
    SELECT MIN(evaluated_at) AS desde, MAX(evaluated_at) AS hasta, COUNT(*) AS n
    FROM signal_history WHERE decision LIKE '%Shadow%';
  `);

  await run("realized_pnl no nulo por decision_base (para detectar PnL 'shadow' en Descartadas)", `
    SELECT split_part(decision, '->', 1) AS decision_base, COUNT(*) AS n,
           COUNT(realized_pnl) AS con_pnl,
           SUM(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl::numeric ELSE 0 END) AS pnl_total
    FROM signal_history WHERE decision IS NOT NULL GROUP BY 1;
  `);

  await run("Señales por día (densidad, para detectar días que dominan un corte)", `
    SELECT date_trunc('day', evaluated_at) AS dia, COUNT(*) AS n
    FROM signal_history GROUP BY 1 ORDER BY 1;
  `);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
