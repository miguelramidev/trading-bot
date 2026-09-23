import { Trader } from "../src/bot/trader.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  
  const trades = await trader.exchange.fetchMyTrades("WLFI/USDT", undefined, 50);
  for (const t of trades) {
     console.log(`Trade ID: ${t.id}, Realized PnL: ${t.info.realizedPnl}, Fee:`, t.fee, `info.commission: ${t.info.commission}`);
  }
}
run().then(() => process.exit(0));
