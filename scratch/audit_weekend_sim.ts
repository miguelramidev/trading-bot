import { db } from "../src/db/index.js";
import ccxt from "ccxt";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const weekendTrades = trades.filter(t => t.evaluatedAt >= new Date("2026-09-18T00:00:00Z"));
  
  console.log(`Simulando ${weekendTrades.length} trades del fin de semana...`);
  
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  let wins = 0;
  let losses = 0;
  let pending = 0;
  
  for (const t of weekendTrades) {
     const candles = await exchange.fetchOHLCV(t.symbol, '1m', t.evaluatedAt.getTime(), 1000);
     if (!candles || candles.length === 0) continue;
     
     const sl = parseFloat(t.gridSL!);
     const tp = parseFloat(t.gridTP!);
     let endReason = "PENDING";
     
     for (const c of candles) {
        const high = c[2] as number;
        const low = c[3] as number;
        
        if (t.direction === "LONG") {
           if (low <= sl) { endReason = "SL"; break; }
           if (high >= tp) { endReason = "TP"; break; }
        } else {
           if (high >= sl) { endReason = "SL"; break; }
           if (low <= tp) { endReason = "TP"; break; }
        }
     }
     
     if (endReason === "TP") wins++;
     else if (endReason === "SL") losses++;
     else pending++;
  }
  
  console.log(`\n=== RESULTADO TOTAL DEL ALGORITMO ===`);
  console.log(`Ganadas (TP Tocado): ${wins}`);
  console.log(`Perdidas (SL Tocado): ${losses}`);
  console.log(`Aún en curso: ${pending}`);
  
  const winrate = (wins / (wins + losses)) * 100;
  console.log(`Winrate Real: ${winrate.toFixed(2)}%`);
  
  // Como usamos 1.0 ATR de SL y 2.0 ATR de TP, la expectativa matemática (R) es:
  // Si R_Ganancia = 2 y R_Perdida = 1
  const expectancy = (wins * 2) - (losses * 1);
  console.log(`\nExpectativa Matemática (R Units): ${expectancy > 0 ? '+' : ''}${expectancy} R`);
}
run().then(() => process.exit(0));
