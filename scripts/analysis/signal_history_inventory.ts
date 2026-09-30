// Inventario general de signal_history: columnas, totales, decisiones,
// cobertura de contexto de mercado, símbolos y estrategias.
// Correr: npx tsx scripts/analysis/signal_history_inventory.ts
// Ver la skill `auditoria-trades` antes de interpretar los resultados.
import { queryAnalytics } from "./lib/analyticsDb.js";

async function run(label: string, query: string) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(await queryAnalytics(query), null, 2));
}

async function main() {
  await run("Columnas de signal_history", `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'signal_history'
    ORDER BY ordinal_position;
  `);

  await run("Totales y rango de fechas", `
    SELECT COUNT(*) AS total,
           COUNT(DISTINCT date_trunc('day', evaluated_at)) AS dias_de_mercado,
           MIN(evaluated_at) AS desde, MAX(evaluated_at) AS hasta
    FROM signal_history;
  `);

  await run("Conteo por decision normalizada e is_active_trade", `
    SELECT
      CASE WHEN decision IS NULL THEN 'PENDIENTE' ELSE split_part(decision, '->', 1) END AS decision_base,
      is_active_trade,
      COUNT(*) AS n
    FROM signal_history
    GROUP BY 1, 2
    ORDER BY n DESC;
  `);

  await run("Con resultado final (SL/TP tocado) vs con PnL real de Binance", `
    SELECT
      COUNT(*) FILTER (WHERE decision LIKE '%Tocado%') AS con_cierre_sl_tp,
      COUNT(*) FILTER (WHERE realized_pnl IS NOT NULL) AS con_realized_pnl,
      COUNT(*) FILTER (WHERE decision LIKE 'Tomada%' AND realized_pnl IS NOT NULL) AS trades_reales_cerrados
    FROM signal_history;
  `);

  await run("Cobertura de contexto de mercado por mes", `
    SELECT
      date_trunc('month', evaluated_at) AS mes,
      COUNT(*) AS total,
      COUNT(regime) AS con_regime, COUNT(atr) AS con_atr, COUNT(bias4h) AS con_bias4h,
      COUNT(btc_correlation) AS con_btc_corr, COUNT(btc_regime) AS con_btc_regime,
      COUNT(funding_rate) AS con_funding, COUNT(open_interest) AS con_oi,
      COUNT(trigger_rsi) AS con_rsi, COUNT(trigger_adx) AS con_adx
    FROM signal_history
    GROUP BY 1 ORDER BY 1;
  `);

  await run("Estrategias y régimen: distribución", `
    SELECT strategy, regime, COUNT(*) AS n
    FROM signal_history GROUP BY strategy, regime ORDER BY n DESC;
  `);

  await run("Símbolos más frecuentes", `
    SELECT symbol, direction, COUNT(*) AS n
    FROM signal_history GROUP BY symbol, direction ORDER BY n DESC LIMIT 15;
  `);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
