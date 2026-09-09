import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq, and } from "drizzle-orm";

async function run() {
  const activeTakenTrades = await db.query.signalHistory.findMany({
    where: and(eq(signalHistory.isActiveTrade, true), eq(signalHistory.decision, "Tomada"))
  });
  console.log("Active LONGs:", activeTakenTrades.filter(t => t.direction === "LONG").length);
  console.log("Active SHORTs:", activeTakenTrades.filter(t => t.direction === "SHORT").length);
}
run().then(() => process.exit(0));
