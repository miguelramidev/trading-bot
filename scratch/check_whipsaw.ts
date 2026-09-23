import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { Trader } from "../src/bot/trader.js";
import { isNotNull, desc } from "drizzle-orm";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();

  const trades = await db.query.signalHistory.findMany({
    where: isNotNull(signalHistory.realizedPnl),
    orderBy: [desc(signalHistory.id)],
    limit: 15
  });
  
  let whipsawed = 0;
  
  for (const t of trades) {
      const pnl = parseFloat(t.realizedPnl || "0");
      if (pnl >= 0) continue; // Only check losses
      
      const symbol = t.symbol.replace(":USDT","");
      const sl = parseFloat(t.stopLoss || "0");
      const tp = parseFloat(t.takeProfit || "0");
      const entry = parseFloat(t.entry || "0");
      
      console.log(`Checking Loss ${symbol} [ID ${t.id}] - Dir: ${t.direction}`);
      
      // We know it hit SL. Let's see if it hit TP within the next 40 candles (10 hours)
      // We'll fetch 15m candles starting from evaluatedAt
      const targetMs = t.evaluatedAt.getTime();
      const forwardCandles = await trader.exchange.fetchOHLCV(symbol, "15m", targetMs, 40);
      
      let wouldHitTP = false;
      let maxDrawdown = 0;
      
      for (const c of forwardCandles) {
          const high = c[2];
          const low = c[3];
          
          if (t.direction === "SHORT") {
              const dd = (high - entry) / entry;
              if (dd > maxDrawdown) maxDrawdown = dd;
              if (low <= tp) { wouldHitTP = true; break; }
          } else {
              const dd = (entry - low) / entry;
              if (dd > maxDrawdown) maxDrawdown = dd;
              if (high >= tp) { wouldHitTP = true; break; }
          }
      }
      
      if (wouldHitTP) {
         console.log(` -> 😭 WHIPSAWED! It swept our SL and then went to TP. Max Drawdown before TP: ${(maxDrawdown*100).toFixed(2)}%`);
         whipsawed++;
      } else {
         console.log(` -> ✅ GOOD SL. The trend actually reversed against us. Max Drawdown reached: ${(maxDrawdown*100).toFixed(2)}%`);
      }
  }
}
run().then(() => process.exit(0));
