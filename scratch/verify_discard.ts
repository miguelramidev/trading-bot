import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 1
  });
  
  if (trades.length > 0) {
      const t = trades[0];
      console.log(`[Última Señal Registrada]`);
      console.log(`Moneda: ${t.symbol}`);
      console.log(`Fecha: ${t.evaluatedAt.toISOString()}`);
      console.log(`Decisión: ${t.decision}`);
      console.log(`Activo en BD: ${t.isActiveTrade}`);
  } else {
      console.log("No se encontraron señales.");
  }
}
run().then(() => process.exit(0));
