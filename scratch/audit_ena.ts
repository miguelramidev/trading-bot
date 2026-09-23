import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { desc, like } from "drizzle-orm";

async function run() {
  const trades = await db
    .select()
    .from(signalHistory)
    .where(like(signalHistory.symbol, "%ENA%"))
    .orderBy(desc(signalHistory.evaluatedAt))
    .limit(5);
  
  console.log(JSON.stringify(trades, null, 2));
}
run();
