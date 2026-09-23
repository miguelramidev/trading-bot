import { Trader } from "../src/bot/trader.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  
  const symbol = "WLFI/USDT";
  
  // Try fetching trades
  const trades = await trader.exchange.fetchMyTrades(symbol, undefined, 50);
  console.log("Recent trades:");
  for (const t of trades) {
     console.log(`- Trade ID: ${t.id}, Side: ${t.side}, Amount: ${t.amount}, Price: ${t.price}, Realized PnL: ${t.info.realizedPnl}`);
  }
}
run().then(() => process.exit(0));
