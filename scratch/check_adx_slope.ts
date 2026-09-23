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
    limit: 10
  });
  
  for (const t of trades) {
      const pnl = parseFloat(t.realizedPnl || "0");
      if (pnl >= 0) continue; // Only check losses
      if (t.strategy !== "1") continue; // Only strat 1
      
      const symbol = t.symbol.replace(":USDT","");
      const targetMs = t.evaluatedAt.getTime();
      const candles = await trader.exchange.fetchOHLCV(symbol, "15m", targetMs - (200 * 15 * 60 * 1000), 200);
      const { adx } = fetcher.calculateADX(candles, 14);
      
      const adxNow = adx[adx.length - 1];
      const adxPrev1 = adx[adx.length - 2];
      const adxPrev2 = adx[adx.length - 3];
      
      const slope = adxNow - adxPrev1;
      
      console.log(`[ID ${t.id}] ${symbol} Dir: ${t.direction} | ADX: ${adxPrev2.toFixed(1)} -> ${adxPrev1.toFixed(1)} -> ${adxNow.toFixed(1)} | Slope: ${slope.toFixed(2)}`);
  }
}
run().then(() => process.exit(0));
