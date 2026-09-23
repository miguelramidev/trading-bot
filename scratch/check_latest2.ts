import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.id)],
    limit: 2
  });
  console.log(trades.map(t => ({id: t.id, symbol: t.symbol, decision: t.decision, triggerAdx: t.triggerAdx})));
}
run().then(() => process.exit(0));
