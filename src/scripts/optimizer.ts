import { DataFetcher } from "../bot/data.js";
import { PullbackStrategy } from "../bot/strategy.js";
import { MomentumStrategy } from "../bot/momentum.js";

async function optimize() {
  const fetcher = new DataFetcher();
  const symbol = "NEAR/USDT";
  const timeframe = "1h";
  
  const allLtfCandles = await fetcher.fetchOhlcv(symbol, timeframe, 1500);
  const htf = "4h";
  const allHtfCandles = await fetcher.fetchOhlcv(symbol, htf, 1500);

  if (!allLtfCandles || !allHtfCandles) return;

  const RRs = [1.0, 1.5, 2.0];
  const ATRs = [2.0, 3.0, 4.0];
  const BREs = [0.8, 1.0]; // Breakeven at 0.8R or 1.0R

  console.log(`Buscando la mejor configuración para ${symbol}...`);

  let bestPnL = -999;
  let bestConfig = "";

  for (const rr of RRs) {
    for (const atr of ATRs) {
      for (const bre of BREs) {
        // Run sim
        let wins = 0;
        let losses = 0;
        let breakevens = 0;
        let activeTrades = [];

        const pullback = new PullbackStrategy(rr, atr);
        const momentum = new MomentumStrategy(rr, atr);

        for (let i = 200; i < allLtfCandles.length; i++) {
          const currentCandle = allLtfCandles[i];
          
          for (let t = activeTrades.length - 1; t >= 0; t--) {
            const trade = activeTrades[t];
            if (!trade.isFilled) {
              trade.candlesSinceSignal++;
              const hitLongEntry = trade.direction === "LONG" && currentCandle.low <= trade.entry && currentCandle.high >= trade.entry;
              const hitShortEntry = trade.direction === "SHORT" && currentCandle.high >= trade.entry && currentCandle.low <= trade.entry;
              
              if (hitLongEntry || hitShortEntry) trade.isFilled = true;
              else if (trade.candlesSinceSignal >= trade.expirationCandles) activeTrades.splice(t, 1);
            }
            
            if (trade.isFilled) {
              let hitTP = false;
              let hitSL = false;
              let hitBreakeven = false;

              // Override breakeven target for testing
              const risk = Math.abs(trade.entry - trade.stopLoss);
              const testBreakevenTarget = trade.direction === "LONG" 
                ? trade.entry + (risk * bre)
                : trade.entry - (risk * bre);

              if (trade.direction === "LONG") {
                if (!trade.breakevenHit && currentCandle.high >= testBreakevenTarget) {
                  trade.breakevenHit = true;
                  trade.stopLoss = trade.entry;
                }
                if (currentCandle.low <= trade.stopLoss) {
                  hitSL = true;
                  if (trade.breakevenHit) hitBreakeven = true;
                }
                if (currentCandle.high >= trade.takeProfit) hitTP = true;
              } else {
                if (!trade.breakevenHit && currentCandle.low <= testBreakevenTarget) {
                  trade.breakevenHit = true;
                  trade.stopLoss = trade.entry;
                }
                if (currentCandle.high >= trade.stopLoss) {
                  hitSL = true;
                  if (trade.breakevenHit) hitBreakeven = true;
                }
                if (currentCandle.low <= trade.takeProfit) hitTP = true;
              }

              if (hitSL) {
                if (hitBreakeven) breakevens++;
                else losses++;
                activeTrades.splice(t, 1);
              } else if (hitTP) {
                wins++;
                activeTrades.splice(t, 1);
              }
            }
          }

          if (activeTrades.length > 0) continue;

          const slicedLtf = allLtfCandles.slice(0, i + 1);
          const slicedHtf = allHtfCandles.filter(c => c.timestamp <= currentCandle.timestamp);

          const btcCandleNow = slicedLtf[slicedLtf.length - 1];
          const btcCandlePast = slicedLtf[slicedLtf.length - Math.min(slicedLtf.length, 50)];
          const mockBtcTrend = btcCandleNow.close > btcCandlePast.close ? "UP" : "DOWN";

          const pullSignal = pullback.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);
          const momSignal = momentum.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);

          let bestSignal = null;
          if (pullSignal && momSignal) bestSignal = pullSignal.score > momSignal.score ? pullSignal : momSignal;
          else bestSignal = pullSignal || momSignal;

          if (bestSignal) {
            activeTrades.push({ ...bestSignal, isFilled: false, candlesSinceSignal: 0, breakevenHit: false });
            i += 5;
          }
        }

        const pnl = (wins * rr) - losses;
        const totalCompleted = wins + losses + breakevens;
        const winrate = totalCompleted > 0 ? ((wins / totalCompleted) * 100).toFixed(2) : 0;
        
        console.log(`[RR=${rr} ATR=${atr} BE=${bre}] -> PnL: ${pnl}R | WR: ${winrate}% | W: ${wins} L: ${losses} BE: ${breakevens}`);
        
        if (pnl > bestPnL) {
          bestPnL = pnl;
          bestConfig = `RR=${rr} ATR=${atr} BE=${bre}`;
        }
      }
    }
  }

  console.log(`\n🏆 MEJOR CONFIGURACIÓN: ${bestConfig} con ${bestPnL}R`);
}

optimize().catch(console.error);
