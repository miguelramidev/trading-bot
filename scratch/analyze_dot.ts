import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { like, desc } from "drizzle-orm";

async function run() {
  const lastSignal = await db.query.signalHistory.findFirst({
    where: like(signalHistory.symbol, "%DOT%"),
    orderBy: [desc(signalHistory.evaluatedAt)]
  });

  console.log(JSON.stringify(lastSignal, null, 2));
}
run().then(() => process.exit(0)).catch(console.error);
