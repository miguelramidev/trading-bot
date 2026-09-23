import { Trader } from "../src/bot/trader.js";
import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  const fetcher = new DataFetcher(trader.exchange);

  const symbol = "BTC/USDT";
  console.log(`Fetching last 2000 15m candles for ${symbol}...`);
  const limit = 1000;
  
  let allCandles: any[] = [];
  const now = Date.now();
  
  const c1 = await trader.exchange.fetchOHLCV(symbol, "15m", now - (limit * 2 * 15 * 60 * 1000), limit);
  const c2 = await trader.exchange.fetchOHLCV(symbol, "15m", now - (limit * 15 * 60 * 1000), limit);
  allCandles = [...c1, ...c2];
  
  console.log(`Got ${allCandles.length} candles. Calculating indicators...`);
  
  const closes = allCandles.map(c => c[4]);
  const highs = allCandles.map(c => c[2]);
  const lows = allCandles.map(c => c[3]);
  const opens = allCandles.map(c => c[1]);
  const formattedCandles = allCandles.map(c => ({ high: c[2], low: c[3], close: c[4] }));
  
  const ema200 = fetcher.calculateEMA(closes, 200);
  const ema21 = fetcher.calculateEMA(closes, 21);
  const ema50 = fetcher.calculateEMA(closes, 50);
  const ema9 = fetcher.calculateEMA(closes, 9);
  
  const ema12 = fetcher.calculateEMA(closes, 12);
  const ema26 = fetcher.calculateEMA(closes, 26);
  
  const macdLine = [];
  for(let i=0; i<closes.length; i++) {
     macdLine.push(ema12[i] - ema26[i]);
  }
  const signalLine = fetcher.calculateEMA(macdLine, 9);
  const macdHist = [];
  for(let i=0; i<closes.length; i++) {
     macdHist.push(macdLine[i] - signalLine[i]);
  }

  const { adx } = fetcher.calculateADX(formattedCandles, 14);
  const atr = fetcher.calculateATR(formattedCandles, 14);

  function runSim(stratName: string, logicFn: (i: number) => "LONG" | "SHORT" | null) {
      let balance = 1000;
      let wins = 0;
      let losses = 0;
      let inTrade = false;
      
      for (let i = 250; i < allCandles.length - 1; i++) {
          if (inTrade) continue;
          
          const dir = logicFn(i);
          if (dir) {
              const entry = closes[i];
              const a = atr[i];
              let sl, tp;
              if (dir === "LONG") {
                  sl = entry - (a * 1.5);
                  tp = entry + (a * 3.0);
              } else {
                  sl = entry + (a * 1.5);
                  tp = entry - (a * 3.0);
              }
              
              // Forward walk
              let hit = null;
              for (let j = i + 1; j < allCandles.length; j++) {
                  const h = highs[j];
                  const l = lows[j];
                  if (dir === "LONG") {
                      if (l <= sl) { hit = "SL"; break; }
                      if (h >= tp) { hit = "TP"; break; }
                  } else {
                      if (h >= sl) { hit = "SL"; break; }
                      if (l <= tp) { hit = "TP"; break; }
                  }
              }
              
              if (hit === "TP") { wins++; balance += 20; inTrade = true; } // fake inTrade logic just to skip candles? No, let's just assume we take every signal
              if (hit === "SL") { losses++; balance -= 10; inTrade = true; }
              inTrade = false; // We can take multiple independent trades
          }
      }
      const total = wins + losses;
      const wr = total > 0 ? ((wins / total)*100).toFixed(1) : "0.0";
      console.log(`${stratName.padEnd(40)} | W: ${wins.toString().padStart(3)} L: ${losses.toString().padStart(3)} | WR: ${wr}% | Bal: $${balance}`);
  }

  runSim("1. Current Strat (ADX > 25, Pullback EMA21)", (i) => {
     if (adx[i] > 25 && adx[i] > adx[i-1] && closes[i] > ema200[i]) {
         if (lows[i] <= ema21[i] * 1.005 && closes[i] > opens[i]) return "LONG";
     }
     if (adx[i] > 25 && adx[i] > adx[i-1] && closes[i] < ema200[i]) {
         if (highs[i] >= ema21[i] * 0.995 && closes[i] < opens[i]) return "SHORT";
     }
     return null;
  });

  runSim("2. Triple EMA (9, 21, 50) + ADX", (i) => {
      // Very strict trending condition: 9 > 21 > 50 > 200
      if (ema9[i] > ema21[i] && ema21[i] > ema50[i] && ema50[i] > ema200[i] && adx[i] > 20) {
          if (lows[i] <= ema21[i] && closes[i] > opens[i]) return "LONG";
      }
      if (ema9[i] < ema21[i] && ema21[i] < ema50[i] && ema50[i] < ema200[i] && adx[i] > 20) {
          if (highs[i] >= ema21[i] && closes[i] < opens[i]) return "SHORT";
      }
      return null;
  });

  runSim("3. MACD Zero-Cross Pullback", (i) => {
     // Trend = Price > EMA 200
     if (closes[i] > ema200[i]) {
         if (macdHist[i] > 0 && macdHist[i-1] < 0 && macdHist[i-2] < 0 && lows[i] > ema50[i]) return "LONG";
     }
     if (closes[i] < ema200[i]) {
         if (macdHist[i] < 0 && macdHist[i-1] > 0 && macdHist[i-2] > 0 && highs[i] < ema50[i]) return "SHORT";
     }
     return null;
  });
  
  runSim("4. Pure Momentum (No Pullback)", (i) => {
     // Buy the breakout instead of the pullback
     if (closes[i] > ema200[i] && adx[i] > 30 && adx[i] > adx[i-1] && macdHist[i] > macdHist[i-1]) {
         // Entering on strong momentum candle
         if (closes[i] > highs[i-1]) return "LONG";
     }
     if (closes[i] < ema200[i] && adx[i] > 30 && adx[i] > adx[i-1] && macdHist[i] < macdHist[i-1]) {
         if (closes[i] < lows[i-1]) return "SHORT";
     }
     return null;
  });

}
run().then(() => process.exit(0));
