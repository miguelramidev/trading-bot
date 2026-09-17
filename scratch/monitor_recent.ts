import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  // Ayer a las 12 del mediodia UTC-3
  // UTC-3 = 15:00 UTC. 
  // Hoy es 16 Septiembre. Ayer era 15 Septiembre.
  const targetTime = new Date("2026-09-15T15:00:00Z");

  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)]
  });
  
  const recentTrades = trades.filter(t => t.evaluatedAt >= targetTime);
  
  console.log(`Operaciones desde ${targetTime.toISOString()} hasta ahora: ${recentTrades.length}\n`);
  
  for (const t of recentTrades) {
    let outcome = "⏳ PENDIENTE";
    if (t.decision?.includes("TP")) outcome = "✅ WIN";
    if (t.decision?.includes("SL")) outcome = "❌ LOSS";
    if (t.isActiveTrade && t.decision !== "Descartada") outcome = "🏃 ACTIVA";
    
    console.log(`[${outcome}] ${t.symbol} | Dir: ${t.direction} | Strat: ${t.strategy} | Decisión: ${t.decision || 'Ninguna'} | FR: ${t.fundingRate || 'N/A'}`);
    if (t.reason) console.log(`   Motivo humano: ${t.reason}`);
  }
}

run().then(() => process.exit(0));
