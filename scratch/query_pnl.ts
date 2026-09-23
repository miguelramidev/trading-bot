import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const allTrades = await db.select().from(signalHistory);
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  
  console.log(`Total signals in DB: ${allTrades.length}`);
  for (const t of allTrades) {
      if (t.realizedPnl !== null) {
          totalPnl += Number(t.realizedPnl);
          if (Number(t.realizedPnl) > 0) wins++;
          else if (Number(t.realizedPnl) < 0) losses++;
      }
  }
  
  console.log(`Live Trades: W: ${wins} L: ${losses} | Total PnL: $${totalPnl.toFixed(2)}`);
  
  // Imprimir los últimos 10 trades perdedores
  const recentLosses = allTrades.filter(t => t.realizedPnl !== null && Number(t.realizedPnl) < 0).slice(-10);
  console.log("\nLast 10 Losses:");
  recentLosses.forEach(t => {
      console.log(`[${t.strategy}] ${t.symbol} | Dir: ${t.direction} | Entry: ${t.entryPrice} | Reason: ${t.reason} | PnL: ${t.realizedPnl}`);
  });
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
