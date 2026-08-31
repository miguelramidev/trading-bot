import { db } from "./src/db/index.js";
import { signalHistory } from "./src/db/schema.js";
import ccxt from "ccxt";

async function main() {
  const history = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 50
  });

  const aaveSignals = history.filter(h => h.symbol.includes("AAVE"));
  const nearSignals = history.filter(h => h.symbol.includes("NEAR"));

  console.log("AAVE Signals:", aaveSignals);
  console.log("NEAR Signals:", nearSignals);

  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  if (aaveSignals.length > 0) {
    const timeframe = aaveSignals[0].timeframe;
    const since = new Date(aaveSignals[0].evaluatedAt).getTime() - (24 * 60 * 60 * 1000); // 1 day before
    const candles = await exchange.fetchOHLCV(aaveSignals[0].symbol, timeframe, since, 100);
    console.log(`\nAAVE ${timeframe} candles around signal:`);
    // Print a few candles around the signal time
    const sigTime = new Date(aaveSignals[0].evaluatedAt).getTime();
    for (const c of candles) {
      if (Math.abs(c[0] - sigTime) < 4 * 60 * 60 * 1000) {
        console.log(`Time: ${new Date(c[0]).toISOString()}, O: ${c[1]}, H: ${c[2]}, L: ${c[3]}, C: ${c[4]}, V: ${c[5]}`);
      }
    }
  }

  if (nearSignals.length > 0) {
    const timeframe = nearSignals[0].timeframe;
    const since = new Date(nearSignals[0].evaluatedAt).getTime() - (24 * 60 * 60 * 1000); // 1 day before
    const candles = await exchange.fetchOHLCV(nearSignals[0].symbol, timeframe, since, 100);
    console.log(`\nNEAR ${timeframe} candles around signal:`);
    const sigTime = new Date(nearSignals[0].evaluatedAt).getTime();
    for (const c of candles) {
      if (Math.abs(c[0] - sigTime) < 4 * 60 * 60 * 1000) {
        console.log(`Time: ${new Date(c[0]).toISOString()}, O: ${c[1]}, H: ${c[2]}, L: ${c[3]}, C: ${c[4]}, V: ${c[5]}`);
      }
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
