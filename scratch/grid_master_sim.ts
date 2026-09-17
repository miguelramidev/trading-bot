import { db } from "../src/db/index.js";
import ccxt from "ccxt";

async function run() {
  const allSignals = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  console.log(`Simulando un total de ${allSignals.length} señales históricas generadas por el bot.\n`);

  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  const cachedCandles = {};
  for (const s of allSignals) {
    try {
       if (!cachedCandles[s.symbol]) {
           cachedCandles[s.symbol] = await exchange.fetchOHLCV(s.symbol, '1m', s.evaluatedAt.getTime(), 1000);
       }
    } catch(e) {}
  }

  function simulateScenario(name, invertLogicFn) {
    let balance = 1000;
    let wins = 0;
    let losses = 0;

    for (const t of allSignals) {
      const candles = cachedCandles[t.symbol];
      if (!candles || candles.length === 0) continue;
      
      const entryPrice = parseFloat(t.entry!);
      const atr = parseFloat(t.atr!);
      const fr = parseFloat(t.fundingRate || "0");
      
      // Determine final direction based on scenario logic
      const finalDirection = invertLogicFn(t, fr);
      
      let slLimit, tpLimit;
      if (finalDirection === "LONG") {
        slLimit = entryPrice - (1.0 * atr);
        tpLimit = entryPrice + (2.0 * atr);
      } else {
        slLimit = entryPrice + (1.0 * atr);
        tpLimit = entryPrice - (2.0 * atr);
      }
      
      const lowerPrice = Math.min(slLimit, tpLimit);
      const upperPrice = Math.max(slLimit, tpLimit);
      
      let stepPct = (atr / 3) / entryPrice;
      if (stepPct < 0.0035) stepPct = 0.0035;
      if (stepPct > 0.012) stepPct = 0.012;
      const stepSize = entryPrice * stepPct;
      
      let numGrids = Math.floor((upperPrice - lowerPrice) / stepSize);
      if(numGrids < 2) numGrids = 2;
      
      const gridSL = finalDirection === "LONG" ? (lowerPrice - stepSize) : (upperPrice + stepSize);
      const gridTP = finalDirection === "LONG" ? (upperPrice + stepSize) : (lowerPrice - stepSize);
      
      const investmentPerLine = balance / (numGrids + 1);
      let gridProfits = 0;
      let currentPrice = entryPrice;
      let endReason = "EXPIRADO";
      
      for (const c of candles) {
         const high = c[2] as number;
         const low = c[3] as number;
         const close = c[4] as number;
         
         if (finalDirection === "LONG") {
           if (low <= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
           if (high >= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
         } else {
           if (high >= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
           if (low <= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
         }
         
         const rangeSteps = Math.floor((high - low) / stepSize);
         if (rangeSteps >= 1) {
            gridProfits += (investmentPerLine * (stepPct - 0.001)) * rangeSteps;
         }
         currentPrice = close;
      }
      
      let dirPnl = finalDirection === "LONG" 
          ? balance * ((currentPrice - entryPrice) / entryPrice)
          : balance * ((entryPrice - currentPrice) / entryPrice);
          
      balance += (dirPnl + gridProfits);
      
      if (endReason === "TP") wins++;
      if (endReason === "SL") losses++;
    }
    
    console.log(`► ${name}`);
    console.log(`  Balance Final: $${balance.toFixed(2)} | Wins: ${wins} | Losses: ${losses}`);
    return balance;
  }

  // Escenario A: Ciego
  simulateScenario("ESCENARIO A (Ciego): Tomar todo tal cual dice el bot", (t, fr) => {
    return t.direction; 
  });

  // Escenario B: Inversión por Funding Rate
  simulateScenario("ESCENARIO B (Funding Invertido): Invertir si el Funding Rate está en contra", (t, fr) => {
    if (t.direction === "SHORT" && fr < 0) return "LONG";
    if (t.direction === "LONG" && fr > 0) return "SHORT";
    return t.direction;
  });

  // Escenario C: Inversión por Macro Trend (BTC Alcista siempre esta semana)
  simulateScenario("ESCENARIO C (Macro Breakout): Invertir todos los SHORTs porque BTC es Alcista", (t, fr) => {
    if (t.direction === "SHORT") return "LONG";
    return t.direction;
  });

}

run().then(() => process.exit(0));
