import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: (history, { eq }) => eq(history.strategy, "3"),
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  console.log(`\n=== ANÁLISIS: Estrategia 3 con Funding Rate A FAVOR ===\n`);
  
  for (const t of trades) {
      let frVal = 0;
      if (t.fundingRate && t.fundingRate !== "N/A") {
          frVal = parseFloat(t.fundingRate.replace("%", ""));
      }
      
      let isFavor = false;
      if (t.direction === "LONG" && frVal < 0) isFavor = true;
      if (t.direction === "SHORT" && frVal > 0) isFavor = true;
      
      if (isFavor) {
          let result = "Pendiente / Ignorado";
          if (t.decision && t.decision.includes("SL Tocado")) {
              result = "❌ PERDIDA VIRTUAL (SL Tocado)";
          } else if (t.decision && t.decision.includes("TP Tocado")) {
              result = "✅ VICTORIA VIRTUAL (TP Tocado)";
          } else if (t.decision && t.decision.includes("Tomada")) {
              result = "🟢 TOMADA (Pendiente)";
          }
          
          console.log(`- ${t.symbol.replace(':USDT', '')} | ${t.direction} | FR: ${t.fundingRate} | Status: ${result}`);
      }
  }
}
run().then(() => process.exit(0));
