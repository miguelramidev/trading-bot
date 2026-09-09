import { DataFetcher } from "../src/bot/data.js";
import ccxt from "ccxt";

async function run() {
  const fetcher = new DataFetcher();
  const symbol = "DOT/USDT:USDT";
  
  // The time of the signal:
  const signalTime = new Date("2026-09-09T14:45:51.154Z").getTime();
  
  // Fetch latest data
  const candles15m = await fetcher.fetchOhlcv(symbol, "15m", 100);
  const candles1h = await fetcher.fetchOhlcv(symbol, "1h", 100);
  const candles4h = await fetcher.fetchOhlcv(symbol, "4h", 100);

  // Function to analyze at a specific timestamp
  const getIndexAtOrBefore = (candles, ts) => {
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].timestamp <= ts) return i;
    }
    return -1;
  };

  const idx15 = getIndexAtOrBefore(candles15m, signalTime);
  const idx4h = getIndexAtOrBefore(candles4h, signalTime);

  const slice15 = candles15m.slice(0, idx15 + 1);
  const slice4h = candles4h.slice(0, idx4h + 1);

  const closes15 = slice15.map(c => c.close);
  const ema200_15 = fetcher.calculateEMA(closes15, 200)[closes15.length - 1] || 0;
  const ema21_15 = fetcher.calculateEMA(closes15, 21)[closes15.length - 1] || 0;
  const { adx } = fetcher.calculateADX(slice15, 14);
  
  const closes4h = slice4h.map(c => c.close);
  const ema50_4h = fetcher.calculateEMA(closes4h, 50)[closes4h.length - 1] || 0;

  console.log("--- MOMENTO DE LA SEÑAL (15m candle start:", new Date(slice15[slice15.length - 1].timestamp).toISOString(), ") ---");
  console.log(`Precio: ${closes15[closes15.length - 1]}`);
  console.log(`EMA 200 (15m): ${ema200_15}`);
  console.log(`EMA 21 (15m): ${ema21_15}`);
  console.log(`ADX (15m): ${adx[adx.length - 1]}`);
  console.log(`EMA 50 (4h): ${ema50_4h}`);
  console.log(`Precio > EMA 50 4h? ${closes4h[closes4h.length-1] > ema50_4h}`);
  
  // Look at next candles
  console.log("\n--- RESULTADO (Siguientes velas 15m) ---");
  const stopLoss = 1.1167;
  const takeProfit = 1.1667;
  
  for (let i = idx15 + 1; i < candles15m.length; i++) {
    const c = candles15m[i];
    console.log(`Time: ${new Date(c.timestamp).toISOString()} | Low: ${c.low} | High: ${c.high} | Close: ${c.close}`);
    if (c.low <= stopLoss) {
      console.log(`>> STOP LOSS HIT at ${c.low}`);
    }
    if (c.high >= takeProfit) {
      console.log(`>> TAKE PROFIT HIT at ${c.high}`);
    }
  }

}
run().then(() => process.exit(0)).catch(console.error);
