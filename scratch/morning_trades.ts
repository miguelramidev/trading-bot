import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 5
  });
  
  for(const t of trades) {
    console.log(`[${t.evaluatedAt.toISOString()}] ${t.symbol} | ${t.direction} (Regime: ${t.regime}) -> ${t.decision} (${t.reason})`);
  }
}
run().then(() => process.exit(0));
