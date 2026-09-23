import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { inArray } from "drizzle-orm";
import { Trader } from "../src/bot/trader.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: inArray(signalHistory.symbol, ['WLFI/USDT:USDT', 'XLM/USDT:USDT']),
    limit: 10
  });
  
  for (const t of trades) {
    if(t.decision && t.decision.includes("Tomada")) {
        console.log(`\nSymbol: ${t.symbol}`);
        console.log(`Entry: ${t.entry} | Direction: ${t.direction}`);
        console.log(`Sniper SL (1 ATR): ${t.stopLoss}`);
        console.log(`Grid SL (Wider): ${t.gridSL}`);
        console.log(`Sniper TP (2 ATR): ${t.takeProfit}`);
        
        // Let's fetch historical 1m candles since entry to see the max excursion!
        const trader = new Trader();
        await trader.exchange.loadMarkets();
        const symbolFormat = t.symbol.replace(":USDT", "");
        
        // Fetch last 1500 1m candles
        const candles = await trader.exchange.fetchOHLCV(symbolFormat, '1m', t.evaluatedAt.getTime(), 1000);
        
        let hitSniperSL = false;
        let hitGridSL = false;
        let hitTP = false;
        
        let maxAdverse = t.direction === 'LONG' ? 999999 : 0;
        let maxFavorable = t.direction === 'LONG' ? 0 : 999999;

        for (const c of candles) {
           const high = c[2];
           const low = c[3];
           
           if (t.direction === "SHORT") {
              if (high > maxAdverse) maxAdverse = high;
              if (low < maxFavorable) maxFavorable = low;
              
              if (!hitSniperSL && high >= parseFloat(t.stopLoss)) hitSniperSL = true;
              if (!hitGridSL && high >= parseFloat(t.gridSL)) hitGridSL = true;
              if (!hitSniperSL && !hitGridSL && low <= parseFloat(t.takeProfit)) hitTP = true;
           } else {
              if (low < maxAdverse) maxAdverse = low;
              if (high > maxFavorable) maxFavorable = high;
              
              if (!hitSniperSL && low <= parseFloat(t.stopLoss)) hitSniperSL = true;
              if (!hitGridSL && low <= parseFloat(t.gridSL)) hitGridSL = true;
              if (!hitSniperSL && !hitGridSL && high >= parseFloat(t.takeProfit)) hitTP = true;
           }
        }
        
        console.log(`Max Adverse Price seen: ${maxAdverse}`);
        console.log(`Max Favorable Price seen: ${maxFavorable}`);
        console.log(`Hit Sniper SL? ${hitSniperSL}`);
        console.log(`Hit Grid SL? ${hitGridSL}`);
        console.log(`Would have hit TP if SL was wider? ${hitGridSL ? "No, Grid SL hit too." : "Maybe, let's see..."}`);
    }
  }
}
run().then(() => process.exit(0));
