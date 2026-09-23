import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.id)],
    limit: 1
  });
  console.log(JSON.stringify(trades[0], null, 2));
}
run().then(() => process.exit(0));
