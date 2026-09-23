import { Trader } from "../src/bot/trader.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  // evaluations for wlfi: 2026-09-21T19:01:27.395Z
  const pnlData = await trader.getTradeRealizedPnl("WLFI/USDT", new Date('2026-09-21T18:00:00.000Z').getTime()); 
  const net = pnlData.pnl - pnlData.fee;
  console.log(`PnL: ${pnlData.pnl}, Fee: ${pnlData.fee}, Net: ${net.toFixed(4)}`);
}
run().then(() => process.exit(0));
