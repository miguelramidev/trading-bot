import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { desc } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: [desc(signalHistory.id)],
    limit: 30
  });
  
  trades.forEach(t => {
     if (t.decision && (t.decision.includes("Tomada") || t.decision.includes("Shadow"))) {
         console.log(`[ID ${t.id}] ${t.symbol} | Dir: ${t.direction} | Strat: ${t.strategy} | PnL: ${t.realizedPnl} | Dec: ${t.decision} | R:${t.triggerRsi} | ADX:${t.triggerAdx}`);
     }
  });
}
run().then(() => process.exit(0));
