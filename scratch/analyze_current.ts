import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const fetcher = new DataFetcher();
  const candles = await fetcher.fetchOhlcv('BTC/USDT:USDT', "15m", 250);
  const closes = candles.map(c => c.close);
  const ema21 = fetcher.calculateEMA(closes, 21);
  const currentPrice = closes[closes.length-1];
  const currentEma21 = ema21[ema21.length-1];
  console.log(`BTC Price: ${currentPrice}`);
  console.log(`EMA 21: ${currentEma21}`);
  console.log(`Distance: ${((currentPrice - currentEma21) / currentEma21 * 100).toFixed(2)}%`);
}
run();
