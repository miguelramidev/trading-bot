import { Trader } from "../src/bot/trader.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  
  try {
     const history = await trader.exchange.fetchFundingRateHistory("BTC/USDT", oneYearAgo, 10);
     console.log("Got history:", history.length);
     if (history.length > 0) {
         console.log("First record:", new Date(history[0].timestamp).toISOString(), "Rate:", history[0].fundingRate);
     }
  } catch(e) {
     console.error("Error:", e);
  }
}
run().then(() => process.exit(0));
