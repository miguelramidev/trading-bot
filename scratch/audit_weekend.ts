import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 100
  });
  
  const weekendTrades = trades.filter(t => t.evaluatedAt >= new Date("2026-09-18T00:00:00Z"));
  
  let total = weekendTrades.length;
  let active = weekendTrades.filter(t => t.isActiveTrade).length;
  let closed = weekendTrades.filter(t => !t.isActiveTrade && t.decision && t.decision.includes("Cerrada")).length;
  let pending = weekendTrades.filter(t => t.decision === null).length;
  
  console.log(`--- AUDITORÍA DEL FIN DE SEMANA ---`);
  console.log(`Total de señales generadas: ${total}`);
  console.log(`Pendientes (null, no se clickeó): ${pending}`);
  console.log(`Aún activas (vigiladas por Shadow Monitor): ${active}`);
  console.log(`Cerradas por Shadow Monitor (notificadas): ${closed}`);
  
  console.log(`\n-- Detalle de Operaciones Activas --`);
  weekendTrades.filter(t => t.isActiveTrade).forEach(t => {
      console.log(`[${t.evaluatedAt.toISOString()}] ${t.symbol} | ${t.direction} | ${t.decision}`);
  });
  
  console.log(`\n-- Detalle de Operaciones Cerradas --`);
  weekendTrades.filter(t => !t.isActiveTrade && t.decision && t.decision.includes("Cerrada")).forEach(t => {
      console.log(`[${t.evaluatedAt.toISOString()}] ${t.symbol} | ${t.direction} | ${t.decision}`);
  });
}
run().then(() => process.exit(0));
