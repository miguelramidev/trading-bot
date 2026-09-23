import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.symbol, 'ASTER/USDT:USDT'),
    orderBy: (history, { desc }) => [desc(history.id)],
    limit: 3
  });
  console.log(JSON.stringify(trades, null, 2));
}
run().then(() => process.exit(0));
