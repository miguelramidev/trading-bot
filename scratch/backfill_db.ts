import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { Trader } from "../src/bot/trader.js";
import { DataFetcher } from "../src/bot/data.js";
import { eq, isNull } from "drizzle-orm";

async function run() {
  const trader = new Trader();
  await trader.exchange.loadMarkets();
  const fetcher = new DataFetcher(trader.exchange);

  const trades = await db.select().from(signalHistory).orderBy(signalHistory.id);
  console.log(`Found ${trades.length} trades to process.`);

  for (const trade of trades) {
    try {
        console.log(`Processing Trade ID ${trade.id}: ${trade.symbol} at ${trade.evaluatedAt}`);
        const symbol = trade.symbol;
        const targetMs = trade.evaluatedAt.getTime();
        
        let updateData: any = {};

        // 1. BACKFILL INDICATORS (if missing)
        if (!trade.triggerRsi || trade.triggerRsi === 'NaN') {
            // Fetch 250 15m candles up to targetMs
            // CCXT fetchOHLCV with 'since' or 'limit'. It's easier to just fetch ending at targetMs.
            // Since CCXT doesn't always support endTime well, we can fetch since targetMs - (250 * 15 * 60 * 1000)
            const sinceMs = targetMs - (250 * 15 * 60 * 1000);
            let candles15m = await fetcher.fetchOhlcv(symbol, "15m", 250, sinceMs);
            
            // Filter out any candles that opened AFTER targetMs
            if (candles15m) {
                candles15m = candles15m.filter(c => c.timestamp <= targetMs);
                // Also remove the exact target candle if it was incomplete at that exact millisecond
                // Wait, if evaluatedAt is 11:31, targetMs is 11:31:xx. The 11:30 candle timestamp is 11:30:00.
                // We want to discard the 11:30 candle because it was incomplete at 11:31.
                // The last fully closed candle would be 11:15.
                // So any candle with timestamp >= targetMs - (15 * 60 * 1000) is incomplete!
                candles15m = candles15m.filter(c => c.timestamp <= targetMs - (15 * 60 * 1000));
                
                if (candles15m.length >= 200) {
                    const closes15m = candles15m.map(c => c.close);
                    const volumes15m = candles15m.map(c => c.volume);
                    
                    const bb = fetcher.calculateBollingerBands(closes15m, 20, 2);
                    const ema21 = fetcher.calculateEMA(closes15m, 21);
                    const smaVol20 = fetcher.calculateSMA(volumes15m, 20);
                    const rsi14 = fetcher.calculateRSI(closes15m, 14);
                    const { adx } = fetcher.calculateADX(candles15m, 14);
                    
                    const currentVol = volumes15m[volumes15m.length - 1];
                    const avgVol = smaVol20[smaVol20.length - 1];
                    
                    updateData.triggerVolume = currentVol.toString();
                    updateData.triggerAvgVolume = avgVol.toFixed(2);
                    updateData.triggerRsi = rsi14[rsi14.length - 1].toFixed(2);
                    updateData.triggerEma21 = ema21[ema21.length - 1].toFixed(4);
                    updateData.triggerAdx = adx[adx.length - 1].toFixed(2);
                    updateData.triggerLowerBb = bb.lower[bb.lower.length - 1].toFixed(4);
                    updateData.triggerUpperBb = bb.upper[bb.upper.length - 1].toFixed(4);
                }
            }
        }

        // 2. BACKFILL PNL FOR "TOMADA" (set to 0 as requested by user)
        if (trade.decision?.includes("Tomada") && !trade.realizedPnl && trade.isActiveTrade === false) {
            updateData.realizedPnl = "0.0000";
            updateData.realizedRoi = "0.00";
        }

        // 3. BACKFILL THEORETICAL PNL FOR "DESCARTADA" / "SHADOW"
        if (trade.decision?.includes("Descartada") && !trade.realizedPnl && trade.isActiveTrade === false) {
            // Forward simulation
            const forwardCandles = await trader.exchange.fetchOHLCV(symbol.replace(":USDT",""), "1m", targetMs, 1000);
            let hitSL = false;
            let hitTP = false;
            
            const sl = parseFloat(trade.stopLoss || "0");
            const tp = parseFloat(trade.takeProfit || "0");
            const entry = parseFloat(trade.entry || "0");
            
            for (const c of forwardCandles) {
                const high = c[2];
                const low = c[3];
                
                if (trade.direction === "SHORT") {
                    if (high >= sl) { hitSL = true; break; }
                    if (low <= tp) { hitTP = true; break; }
                } else {
                    if (low <= sl) { hitSL = true; break; }
                    if (high >= tp) { hitTP = true; break; }
                }
            }
            
            const margin = parseFloat(trade.accountBalance || "40.0") * 0.20;
            // Target notional minimum 10
            const leverage = Math.max(1, Math.ceil(10.0 / margin));
            const notional = margin * leverage;
            
            if (hitTP) {
                const pct = Math.abs(tp - entry) / entry;
                const profit = notional * pct;
                const roi = (profit / margin) * 100;
                updateData.realizedPnl = profit.toFixed(4);
                updateData.realizedRoi = roi.toFixed(2);
                updateData.decision = trade.decision + " (Shadow TP ✅)";
            } else if (hitSL) {
                const pct = Math.abs(sl - entry) / entry;
                const loss = -(notional * pct);
                const roi = (loss / margin) * 100;
                updateData.realizedPnl = loss.toFixed(4);
                updateData.realizedRoi = roi.toFixed(2);
                updateData.decision = trade.decision + " (Shadow SL ❌)";
            } else {
                updateData.decision = trade.decision + " (Shadow Abierta/Desconocido)";
            }
        }
        
        if (Object.keys(updateData).length > 0) {
            await db.update(signalHistory).set(updateData).where(eq(signalHistory.id, trade.id));
            console.log(`Updated ID ${trade.id} with ${JSON.stringify(updateData)}`);
        }
    } catch(e: any) {
        console.error(`Error on ID ${trade.id}: ${e.message}`);
    }
  }
  console.log("Done.");
}

run().then(() => process.exit(0));
