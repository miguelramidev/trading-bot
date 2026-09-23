import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { gt } from "drizzle-orm";

async function run() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const trades = await db.query.signalHistory.findMany({
    where: gt(signalHistory.evaluatedAt, yesterday),
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  console.log(`=== AUDITORIA 24 HORAS ===`);
  console.log(`Total señales generadas: ${trades.length}`);
  
  let tomadas = 0;
  let ganadas = 0;
  let perdidas = 0;
  
  for (const t of trades) {
     console.log(`\n[${t.evaluatedAt.toISOString()}] ${t.symbol} | ${t.direction} | Est: ${t.strategy} (${t.regime})`);
     console.log(`Decisión: ${t.decision || 'No tomada'} | Activa: ${t.isActiveTrade}`);
     
     if (t.decision && t.decision.includes("Tomada")) {
         tomadas++;
         if (t.decision.includes("TP")) ganadas++;
         if (t.decision.includes("SL")) perdidas++;
     }
  }
  
  console.log(`\nResumen de Ejecución Real:`);
  console.log(`Trades Tomados: ${tomadas}`);
  console.log(`Ganados: ${ganadas} | Perdidos: ${perdidas}`);
  
}
run().then(() => process.exit(0));
