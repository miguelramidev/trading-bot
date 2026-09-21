import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  let capital = 1000;
  const RISK_PERCENT = 0.01; // Riesgamos 1% de la cuenta por trade
  const REWARD_MULTIPLIER = 2; // Ratio 1:2
  
  let totalTrades = 0;
  let wins = 0;
  let losses = 0;
  
  console.log(`\n=== BACKTEST GLOBAL (Con Estrategias 1 a 4) ===\n`);
  console.log(`Capital Inicial: $1000.00 | Riesgo: 1% por trade | Ratio 1:2\n`);
  
  for (const t of trades) {
      if (!t.decision) continue;
      
      const hitSL = t.decision.includes("SL Tocado");
      const hitTP = t.decision.includes("TP Tocado");
      
      if (!hitSL && !hitTP) continue; // Descartar los que no cerraron aún
      
      // Determinar si aplica Estrategia 4 (Funding Rate en contra)
      let frVal = 0;
      if (t.fundingRate && t.fundingRate !== "N/A") {
          frVal = parseFloat(t.fundingRate.replace("%", ""));
      }
      
      let strat4Flipped = false;
      if (t.direction === "LONG" && frVal > 0) strat4Flipped = true;
      if (t.direction === "SHORT" && frVal < 0) strat4Flipped = true;
      
      // Determinar si ganamos o perdimos
      let weWon = false;
      if (!strat4Flipped) {
          // Dirección original
          if (hitTP) weWon = true;
          if (hitSL) weWon = false;
      } else {
          // Invertimos la dirección!
          if (hitSL) weWon = true; // El original falló, nuestra inversión ganó!
          if (hitTP) weWon = false; // El original ganó, nuestra inversión falló!
      }
      
      // Calcular impacto en capital
      const riskAmount = capital * RISK_PERCENT;
      let pnl = 0;
      if (weWon) {
          pnl = riskAmount * REWARD_MULTIPLIER;
          capital += pnl;
          wins++;
      } else {
          pnl = -riskAmount;
          capital += pnl;
          losses++;
      }
      totalTrades++;
      
      const dirUsed = strat4Flipped ? (t.direction === "LONG" ? "SHORT (Invertido)" : "LONG (Invertido)") : t.direction;
      const resText = weWon ? "✅ WIN " : "❌ LOSS";
      
      console.log(`[${t.evaluatedAt.toISOString().split('T')[0]}] ${t.symbol.replace(':USDT','')} | Dir: ${dirUsed} | PnL: ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)} | Capital: $${capital.toFixed(2)}`);
  }
  
  console.log(`\n=== RESUMEN FINAL ===`);
  console.log(`Total Operaciones Procesadas: ${totalTrades}`);
  console.log(`Victorias: ${wins}`);
  console.log(`Derrotas: ${losses}`);
  const wr = ((wins / totalTrades) * 100).toFixed(2);
  console.log(`WIN RATE GLOBAL: ${wr}%`);
  console.log(`Capital Final: $${capital.toFixed(2)}`);
  console.log(`Retorno Neto: ${((capital - 1000) / 10).toFixed(2)}%`);
}
run().then(() => process.exit(0));
