import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 20
  });
  
  const trx = trades.find(t => t.symbol.includes("TRX"));
  console.log(JSON.stringify(trx, null, 2));
}

run().then(() => process.exit(0));
