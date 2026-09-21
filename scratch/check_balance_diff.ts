import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  if (trades.length === 0) return;
  
  const initialBalance = parseFloat(trades[0].accountBalance || "0");
  const peakBalance = Math.max(...trades.map(t => parseFloat(t.accountBalance || "0")));
  const lastBalance = parseFloat(trades[trades.length - 1].accountBalance || "0");
  
  console.log(`Balance Inicial/Pico: $${peakBalance.toFixed(2)}`);
  console.log(`Balance Actual (Último reporte): $${lastBalance.toFixed(2)}`);
  console.log(`Diferencia: $${(lastBalance - peakBalance).toFixed(2)}`);
  
  // Buscar trades que el usuario realmente haya tomado
  const tomadas = trades.filter(t => t.decision && t.decision.includes("Tomada"));
  console.log(`\nHistorial de trades REALMENTE tomados por ti:`);
  for (const t of tomadas) {
    console.log(`- ${t.symbol}: ${t.decision}`);
  }
}
run().then(() => process.exit(0));
