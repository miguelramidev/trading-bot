import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq, and } from "drizzle-orm";

async function run() {
  const result = await db.update(signalHistory)
    .set({ isActiveTrade: true })
    .where(and(eq(signalHistory.decision, "Tomada"), eq(signalHistory.isActiveTrade, false)));
  
  console.log("Trades marcados como activos.");
}
run().then(() => process.exit(0)).catch(console.error);
