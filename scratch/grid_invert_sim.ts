import { db } from "../src/db/index.js";
import ccxt from "ccxt";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const tomadas = trades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  console.log(`Simulando la INVERSIÓN de las ${tomadas.length} operaciones tomadas.`);

  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  let balance = 1000;
  const slMult = 1.0;
  const tpMult = 2.0;

  for (const t of tomadas) {
    let candles = [];
    try {
       candles = await exchange.fetchOHLCV(t.symbol, '1m', t.evaluatedAt.getTime(), 1000);
    } catch(e) {
       console.log(`Error bajando ${t.symbol}`); continue;
    }
    
    if (!candles || candles.length === 0) continue;
    
    const entryPrice = parseFloat(t.entry!);
    const atr = parseFloat(t.atr!);
    
    // INVERTIMOS LA DIRECCIÓN
    const originalDir = t.direction;
    const invertedDir = originalDir === "SHORT" ? "LONG" : "SHORT";
    
    let slLimit, tpLimit;
    if (invertedDir === "LONG") {
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
    
    const gridSL = invertedDir === "LONG" ? (lowerPrice - stepSize) : (upperPrice + stepSize);
    const gridTP = invertedDir === "LONG" ? (upperPrice + stepSize) : (lowerPrice - stepSize);
    
    const linesCount = numGrids + 1;
    const investmentPerLine = balance / linesCount;
    let gridProfits = 0;
    
    let currentPrice = entryPrice;
    let endReason = "EXPIRADO";
    
    for (const c of candles) {
       const high = c[2] as number;
       const low = c[3] as number;
       const close = c[4] as number;
       
       if (invertedDir === "LONG") {
         if (low <= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
         if (high >= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
       } else {
         if (high >= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
         if (low <= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
       }
       
       const rangeSteps = Math.floor((high - low) / stepSize);
       if (rangeSteps >= 1) {
          const arbProfit = investmentPerLine * (stepPct - 0.001);
          gridProfits += arbProfit * rangeSteps;
       }
       
       currentPrice = close;
    }
    
    let directionalPnl = 0;
    if (invertedDir === "LONG") {
       directionalPnl = balance * ((currentPrice - entryPrice) / entryPrice);
    } else {
       directionalPnl = balance * ((entryPrice - currentPrice) / entryPrice);
    }
    
    const netPnl = directionalPnl + gridProfits;
    balance += netPnl;
    
    console.log(`${t.symbol}: Bot dijo ${originalDir} -> Invertimos a ${invertedDir}. Finalizó por: ${endReason}. PnL: $${netPnl.toFixed(2)}`);
  }
  
  console.log(`\n=== BALANCE FINAL SIMULANDO INVERSIÓN: $${balance.toFixed(2)} ===`);
}

run().then(() => process.exit(0));
