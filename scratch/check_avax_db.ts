import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { ilike } from "drizzle-orm";

async function run() {
  const signal = await db.query.signalHistory.findFirst({
    where: ilike(signalHistory.symbol, 'AVAX%'),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)]
  });
  console.log(signal);
}
run().then(() => process.exit(0));
