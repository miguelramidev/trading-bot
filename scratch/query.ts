import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { desc } from "drizzle-orm";

async function run() {
  const latest = await db.select().from(signalHistory).orderBy(desc(signalHistory.evaluatedAt)).limit(5);
  console.log(JSON.stringify(latest, null, 2));
}
run();
