import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.symbol, 'ZETA/USDT:USDT'),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 1
  });
  console.log(trades);
}
run().then(() => process.exit(0));
