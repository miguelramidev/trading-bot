import { db } from "../src/db/index.js";
import ccxt from "ccxt";

async function run() {
  const allSignals = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const cachedCandles = {};
  for (const s of allSignals) {
    try {
       if (!cachedCandles[s.symbol]) {
           cachedCandles[s.symbol] = await exchange.fetchOHLCV(s.symbol, '1m', s.evaluatedAt.getTime(), 1000);
       }
    } catch(e) {}
  }

  function simulateScenario(name, logicFn) {
    let balance = 1000;
    let wins = 0; let losses = 0;

    for (const t of allSignals) {
      const candles = cachedCandles[t.symbol];
      if (!candles || candles.length === 0) continue;
      
      const entryPrice = parseFloat(t.entry!);
      const atr = parseFloat(t.atr!);
      let corrStr = t.btcCorrelation || "0%";
      if (corrStr === "N/A") corrStr = "0%";
      const corrVal = parseFloat(corrStr.replace("%", ""));
      
      const finalDirection = logicFn(t, corrVal);
      
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
         const high = c[2] as number; const low = c[3] as number; const close = c[4] as number;
         if (finalDirection === "LONG") {
           if (low <= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
           if (high >= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
         } else {
           if (high >= gridSL) { currentPrice = gridSL; endReason = "SL"; break; }
           if (low <= gridTP) { currentPrice = gridTP; endReason = "TP"; break; }
         }
         const rangeSteps = Math.floor((high - low) / stepSize);
         if (rangeSteps >= 1) gridProfits += (investmentPerLine * (stepPct - 0.001)) * rangeSteps;
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
  }

  console.log("\n=== INVESTIGANDO CORRELACIONES EXTREMADAMENTE BAJAS O NEGATIVAS ===");

  simulateScenario("ESCENARIO BASE: Invertir TODO (Ganancia Máxima Probada)", (t, corr) => {
    if (t.direction === "SHORT") return "LONG";
    return t.direction;
  });

  simulateScenario("TEORÍA A: Respetar SHORT original si Correlación es < 50%", (t, corr) => {
    if (t.direction === "SHORT" && corr < 50) return t.direction; 
    if (t.direction === "SHORT") return "LONG";
    return t.direction; 
  });

  simulateScenario("TEORÍA B: Respetar SHORT original si Correlación es < 30%", (t, corr) => {
    if (t.direction === "SHORT" && corr < 30) return t.direction; 
    if (t.direction === "SHORT") return "LONG";
    return t.direction; 
  });

  simulateScenario("TEORÍA C: Respetar SHORT original SOLO si la Correlación es NEGATIVA (< 0%)", (t, corr) => {
    // Si la moneda hace literalmente lo OPUESTO a BTC matemáticamente, entonces tal vez sí deberíamos hacerle SHORT.
    if (t.direction === "SHORT" && corr < 0) return t.direction; 
    if (t.direction === "SHORT") return "LONG";
    return t.direction; 
  });
}

run().then(() => process.exit(0));
