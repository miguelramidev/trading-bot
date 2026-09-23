import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { Trader } from "../src/bot/trader.js";
import { DataFetcher } from "../src/bot/data.js";
import { isNotNull, desc } from "drizzle-orm";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  const fetcher = new DataFetcher(trader.exchange);

  const trades = await db.query.signalHistory.findMany({
    where: isNotNull(signalHistory.realizedPnl),
    orderBy: [desc(signalHistory.id)],
    limit: 100
  });
  
  let stats = {
      original: { wins: 0, losses: 0 },
      withFilter: { wins: 0, losses: 0 },
      vetoed: { winsPrevented: 0, lossesPrevented: 0 }
  };
  
  console.log("Analyzing Strategy 1 Trades...");

  for (const t of trades) {
      if (t.strategy !== "1") continue;
      
      const pnl = parseFloat(t.realizedPnl || "0");
      if (pnl === 0) continue; // Skip 0 PnL
      const isWin = pnl > 0;
      
      const symbol = t.symbol.replace(":USDT","");
      const targetMs = t.evaluatedAt.getTime();
      
      // Fetch 250 candles ending exactly 15 minutes before the targetMs (to represent the completed candles at that moment)
      const since = targetMs - (250 * 15 * 60 * 1000);
      let candles = await trader.exchange.fetchOHLCV(symbol, "15m", since, 250);
      
      // Filter out incomplete candles (timestamp >= targetMs)
      // Actually the signal is evaluated at 12:16, so the 12:15 candle is INCOMPLETE!
      // We must pop() it just like analyze.ts does.
      candles = candles.filter(c => c[0] < targetMs);
      
      // Emulate the .pop() bug fix (the last candle in the array is the currently open one, so we must ignore it if it's the 12:15 candle)
      // If evaluatedAt is 12:16, targetMs is 12:16. The candle of 12:15 has timestamp 12:15.
      // So candles with timestamp >= targetMs - (1 * 60 * 1000) are incomplete.
      // Actually, if we filter c[0] < targetMs, the 12:15 candle IS included.
      // And since 12:15 is incomplete until 12:30, we must discard it.
      // So we keep candles where c[0] <= targetMs - (15 * 60 * 1000).
      candles = candles.filter(c => c[0] <= targetMs - (15 * 60 * 1000));
      
      try {
          const { adx } = fetcher.calculateADX(candles.map(c => ({
              timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
          })), 14);
          
          const adxNow = adx[adx.length - 1];
          const adxPrev = adx[adx.length - 2];
          
          const isRising = adxNow > adxPrev;
          
          isWin ? stats.original.wins++ : stats.original.losses++;
          
          if (isRising) {
              isWin ? stats.withFilter.wins++ : stats.withFilter.losses++;
              console.log(`[ID ${t.id}] ${symbol} | Result: ${isWin ? "WIN ✅" : "LOSS ❌"} | ADX: ${adxPrev.toFixed(1)} -> ${adxNow.toFixed(1)} (Rising) -> PASSED`);
          } else {
              isWin ? stats.vetoed.winsPrevented++ : stats.vetoed.lossesPrevented++;
              console.log(`[ID ${t.id}] ${symbol} | Result: ${isWin ? "WIN ✅" : "LOSS ❌"} | ADX: ${adxPrev.toFixed(1)} -> ${adxNow.toFixed(1)} (Falling) -> VETOED 🛑`);
          }
      } catch(e) {
          console.log(`Error processing ${symbol}: ${e}`);
      }
  }
  
  console.log("\n--- SIMULATION RESULTS ---");
  console.log(`Original Strat 1: ${stats.original.wins} Wins, ${stats.original.losses} Losses (Winrate: ${((stats.original.wins / (stats.original.wins + stats.original.losses)) * 100).toFixed(1)}%)`);
  console.log(`With ADX Slope Filter: ${stats.withFilter.wins} Wins, ${stats.withFilter.losses} Losses (Winrate: ${((stats.withFilter.wins / (stats.withFilter.wins + stats.withFilter.losses)) * 100).toFixed(1)}%)`);
  console.log(`\nThe filter correctly prevented ${stats.vetoed.lossesPrevented} LOSSES, but sacrificed ${stats.vetoed.winsPrevented} WINS.`);
}
run().then(() => process.exit(0));
