import { Trader } from "../src/bot/trader.js";
import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  const fetcher = new DataFetcher(trader.exchange);

  const symbol = "ASTER/USDT:USDT"; // Binance uses ASTR, maybe ASTR? Let's try ASTER first, then ASTR.
  let target = symbol;
  try {
     await fetcher.fetchOhlcv(target, "15m", 1);
  } catch(e) {
     target = "ASTR/USDT:USDT";
  }
  
  const candles15 = await fetcher.fetchOhlcv(target, "15m", 10);
  const candles4h = await fetcher.fetchOhlcv(target, "4h", 5);
  
  console.log(`=== 15m Candles (${target}) ===`);
  candles15?.forEach(c => {
      console.log(`Time: ${new Date(c.timestamp).toISOString()} | O: ${c.open} H: ${c.high} L: ${c.low} C: ${c.close} | V: ${c.volume}`);
  });
  
  console.log(`\n=== 4H Candles (${target}) ===`);
  candles4h?.forEach(c => {
      console.log(`Time: ${new Date(c.timestamp).toISOString()} | O: ${c.open} H: ${c.high} L: ${c.low} C: ${c.close} | V: ${c.volume}`);
  });

  const btcCandles = await fetcher.fetchOhlcv("BTC/USDT:USDT", "15m", 5);
  console.log("\n=== BTC 15m ===");
  btcCandles?.forEach(c => {
      console.log(`Time: ${new Date(c.timestamp).toISOString()} | C: ${c.close}`);
  });
}
run().then(() => process.exit(0));
