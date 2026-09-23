import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.isActiveTrade, true),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)]
  });
  console.log(trades);
}
run().then(() => process.exit(0));
