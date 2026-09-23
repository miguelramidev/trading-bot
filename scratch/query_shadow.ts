import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const allTrades = await db.select().from(signalHistory);
  
  // Trades that were NOT executed (rejected by user, or blocked by filters)
  // Wait, in this bot, if the Macro filter blocks it, does it save to DB? 
  // Let's check the schema or all trades.
  
  const shadowTrades = allTrades.filter(t => t.realizedPnl === null || t.status === 'REJECTED' || t.status === 'BLOCKED' || t.reason?.includes("Descartaste"));
  
  console.log(`Total trades in DB: ${allTrades.length}`);
  console.log(`Shadow/Rejected/Blocked trades: ${shadowTrades.length}`);
  
  let w = 0;
  let l = 0;
  
  shadowTrades.slice(-20).forEach(t => {
      console.log(`[${t.status}] ${t.symbol} | Dir: ${t.direction} | Reason: ${t.reason} | PnL: ${t.realizedPnl} | Shadow PnL?`);
  });
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
