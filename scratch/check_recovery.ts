import { db } from "../src/db/index.js";
import { userConfig } from "../src/db/schema.js";
import { Trader } from "../src/bot/trader.js";

async function run() {
  const configs = await db.select().from(userConfig);
  const startingBalance = parseFloat(configs[0]?.startingBalance || "41.78");

  const trader = new Trader();
  await trader.exchange.loadMarkets();
  const balance = await trader.exchange.fetchBalance();
  const currentBalance = balance.total['USDT'] || 0;

  console.log(`Starting Balance: ${startingBalance}`);
  console.log(`Current Balance: ${currentBalance}`);
  console.log(`Diff: ${currentBalance - startingBalance}`);
}
run().then(() => process.exit(0));
