import { DataFetcher } from "../src/bot/data.js";
import { db } from "../src/db/index.js";
import { Resource } from "sst";

async function run() {
  const fetcher = new DataFetcher();
  const balance = await fetcher.getUSDTBalance();
  
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  let initialBalance = 0;
  if (trades.length > 0) {
      initialBalance = parseFloat(trades[0].accountBalance || "0");
  }
  
  const currentTotal = balance.total;
  const difference = currentTotal - initialBalance;
  
  console.log(`Balance Inicial Registrado (Primer Trade): $${initialBalance.toFixed(2)}`);
  console.log(`Balance Actual Total (Binance): $${currentTotal.toFixed(2)}`);
  console.log(`Diferencia: $${difference.toFixed(2)}`);
  
  // Calcular PnL de todas las trades tomadas en la DB
  const tomadas = trades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  console.log(`\nHistorial de Operaciones Tomadas (${tomadas.length}):`);
  
  let totalPerdido = 0;
  
  // Estimamos el balance inicial asumiendo que empezó con $55 (por reportes anteriores)
  console.log("\n(Nota: Si depositaste más dinero o retiraste, la Diferencia no reflejará el PnL exacto)");
}

run().then(() => process.exit(0));
