import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  let totalAgainst = 0;
  let originalWins = 0;
  let originalLosses = 0;
  
  console.log(`\n=== SIMULACIÓN: ESTRATEGIA 4 (Ir a favor del Market Maker / Contra FR) ===\n`);
  
  for (const t of trades) {
      if (!t.fundingRate || t.fundingRate === "N/A") continue;
      
      const frVal = parseFloat(t.fundingRate.replace("%", ""));
      let isAgainst = false;
      
      // Originalmente el bot sugirió esto:
      if (t.direction === "LONG" && frVal > 0) isAgainst = true;
      if (t.direction === "SHORT" && frVal < 0) isAgainst = true;
      
      if (isAgainst && t.decision) {
          totalAgainst++;
          
          let origOutcome = "";
          let strat4Outcome = "";
          
          if (t.decision.includes("SL Tocado")) {
              originalLosses++;
              origOutcome = "PERDIÓ";
              strat4Outcome = "GANÓ (Inversión Exitosa)";
          } else if (t.decision.includes("TP Tocado")) {
              originalWins++;
              origOutcome = "GANÓ";
              strat4Outcome = "PERDIÓ (Inversión Fallida)";
          } else {
              continue; // Aún pendiente, no lo contamos
          }
          
          const inverseDir = t.direction === "LONG" ? "SHORT" : "LONG";
          
          console.log(`- ${t.symbol.replace(':USDT', '')} | Orig: ${t.direction} (${origOutcome}) -> Strat 4: ${inverseDir} (${strat4Outcome}) | FR: ${t.fundingRate}`);
      }
  }
  
  console.log(`\nRESUMEN DE RESULTADOS SI HUBIÉSEMOS APLICADO ESTRATEGIA 4:`);
  console.log(`- Total Trades con FR en Contra Evaluados: ${originalWins + originalLosses}`);
  console.log(`- Veces que Estrategia 4 habría GANADO: ${originalLosses} (Evitamos el SL original y cobramos)`);
  console.log(`- Veces que Estrategia 4 habría PERDIDO: ${originalWins} (El original sí llegó al TP a pesar de la masa)`);
  
  const wr = ((originalLosses / (originalWins + originalLosses)) * 100).toFixed(2);
  console.log(`- WIN RATE ESTRATEGIA 4: ${wr}%`);
}
run().then(() => process.exit(0));
