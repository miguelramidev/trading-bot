import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 50
  });
  
  const zec = trades.find(t => t.symbol.includes("ZEC"));
  const trx = trades.find(t => t.symbol.includes("TRX"));
  
  console.log("=== ZEC ===");
  if (zec) {
     console.log(`Evaluated: ${zec.evaluatedAt}`);
     console.log(`Direction: ${zec.direction}`);
     console.log(`Strategy: ${zec.strategy}`);
     console.log(`Regime/Reason: ${zec.regime} / ${zec.reason}`);
     console.log(`Bias 4H: ${zec.bias4h}`);
  }
  
  console.log("\n=== TRX ===");
  if (trx) {
     console.log(`Evaluated: ${trx.evaluatedAt}`);
     console.log(`Direction: ${trx.direction}`);
     console.log(`Strategy: ${trx.strategy}`);
     console.log(`Regime/Reason: ${trx.regime} / ${trx.reason}`);
     console.log(`Bias 4H: ${trx.bias4h}`);
  }
}

run().then(() => process.exit(0));
