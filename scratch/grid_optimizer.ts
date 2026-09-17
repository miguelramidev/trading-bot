import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import ccxt from "ccxt";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const tomadas = trades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  console.log(`Encontradas ${tomadas.length} operaciones tomadas.`);

  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  // Precargar las velas para todas las operaciones tomadas para que sea súper rápido
  const cachedCandles = {};
  for (const t of tomadas) {
    try {
       cachedCandles[t.symbol] = await exchange.fetchOHLCV(t.symbol, '1m', t.evaluatedAt.getTime(), 1000);
    } catch(e) {
       console.log(`Error bajando ${t.symbol}`);
    }
  }

  // Barredora de Parámetros
  const slMults = [1.0, 1.2, 1.5, 1.8, 2.0];
  const tpMults = [1.5, 2.0, 3.0, 4.0];
  
  const results = [];

  for (const slMult of slMults) {
    for (const tpMult of tpMults) {
      let balance = 1000;
      
      for (const t of tomadas) {
        const candles = cachedCandles[t.symbol];
        if (!candles || candles.length === 0) continue;
        
        const entryPrice = parseFloat(t.entry!);
        const atr = parseFloat(t.atr!);
        
        let slLimit, tpLimit;
        if (t.direction === "LONG") {
          slLimit = entryPrice - (slMult * atr);
          tpLimit = entryPrice + (tpMult * atr);
        } else {
          slLimit = entryPrice + (slMult * atr);
          tpLimit = entryPrice - (tpMult * atr);
        }
        
        const lowerPrice = Math.min(slLimit, tpLimit);
        const upperPrice = Math.max(slLimit, tpLimit);
        
        let stepPct = (atr / 3) / entryPrice;
        if (stepPct < 0.0035) stepPct = 0.0035;
        if (stepPct > 0.012) stepPct = 0.012;
        const stepSize = entryPrice * stepPct;
        
        let numGrids = Math.floor((upperPrice - lowerPrice) / stepSize);
        if(numGrids < 2) numGrids = 2;
        
        const gridSL = t.direction === "LONG" ? (lowerPrice - stepSize) : (upperPrice + stepSize);
        const gridTP = t.direction === "LONG" ? (upperPrice + stepSize) : (lowerPrice - stepSize);
        
        const linesCount = numGrids + 1;
        const investmentPerLine = balance / linesCount;
        let gridProfits = 0;
        
        let currentPrice = entryPrice;
        
        for (const c of candles) {
           const high = c[2] as number;
           const low = c[3] as number;
           const close = c[4] as number;
           
           if (t.direction === "LONG") {
             if (low <= gridSL) { currentPrice = gridSL; break; }
             if (high >= gridTP) { currentPrice = gridTP; break; }
           } else {
             if (high >= gridSL) { currentPrice = gridSL; break; }
             if (low <= gridTP) { currentPrice = gridTP; break; }
           }
           
           const rangeSteps = Math.floor((high - low) / stepSize);
           if (rangeSteps >= 1) {
              const arbProfit = investmentPerLine * (stepPct - 0.001);
              gridProfits += arbProfit * rangeSteps;
           }
           
           currentPrice = close;
        }
        
        let directionalPnl = 0;
        if (t.direction === "LONG") {
           directionalPnl = balance * ((currentPrice - entryPrice) / entryPrice);
        } else {
           directionalPnl = balance * ((entryPrice - currentPrice) / entryPrice);
        }
        
        balance += (directionalPnl + gridProfits);
      }
      
      results.push({ slMult, tpMult, balance });
    }
  }
  
  results.sort((a, b) => b.balance - a.balance);
  console.log("\n=== TOP 5 MEJORES CONFIGURACIONES ===");
  for (let i=0; i<5; i++) {
     console.log(`${i+1}. SL: ${results[i].slMult.toFixed(1)} ATR | TP: ${results[i].tpMult.toFixed(1)} ATR => Balance: $${results[i].balance.toFixed(2)}`);
  }
}

run().then(() => process.exit(0));
