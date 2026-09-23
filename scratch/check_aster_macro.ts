import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { inArray } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: inArray(signalHistory.id, [164, 163, 160, 159, 158, 157])
  });
  
  trades.forEach(t => {
     console.log(`[ID ${t.id}] ${t.symbol} | BTC Regime: ${t.btcRegime} | Corr: ${t.btcCorrelation} | Reason: ${t.reason}`);
  });
}
run().then(() => process.exit(0));
