import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: (history, { eq }) => eq(history.strategy, "3"),
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  console.log(`Total Estrategia 3: ${trades.length}`);
  
  for (const t of trades) {
      console.log(`- ${t.symbol} | Dir: ${t.direction} | FR: ${t.fundingRate} | Decision: ${t.decision}`);
  }
}
run().then(() => process.exit(0));
