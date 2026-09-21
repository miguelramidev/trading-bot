import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 100
  });
  
  const trump = trades.filter(t => t.symbol.includes("TRUMP"));
  console.log(`--- Análisis de TRUMP ---`);
  if (trump.length > 0) {
     for (const t of trump) {
        console.log(`[${t.evaluatedAt.toISOString()}] ${t.symbol} | Dir: ${t.direction} | Decision: ${t.decision} | Activo: ${t.isActiveTrade}`);
     }
  } else {
     console.log("No se encontraron registros de TRUMP en las últimas 100 señales.");
  }
  
  const activas = trades.filter(t => t.isActiveTrade);
  console.log(`\n--- Operaciones Activas ---`);
  if (activas.length > 0) {
     for (const t of activas) {
        console.log(`[${t.evaluatedAt.toISOString()}] ${t.symbol} | Dir: ${t.direction} | Decision: ${t.decision}`);
     }
  } else {
     console.log("No hay operaciones activas actualmente.");
  }
}
run().then(() => process.exit(0));
