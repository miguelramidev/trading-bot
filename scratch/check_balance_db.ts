import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  if (trades.length === 0) {
      console.log("No hay trades.");
      return;
  }
  
  const firstBalance = parseFloat(trades[0].accountBalance || "0");
  const lastBalance = parseFloat(trades[trades.length - 1].accountBalance || "0");
  
  const difference = lastBalance - firstBalance;
  
  console.log(`Balance al inicio del bot: $${firstBalance.toFixed(2)}`);
  console.log(`Último balance registrado en DB: $${lastBalance.toFixed(2)}`);
  console.log(`Diferencia Total: $${difference.toFixed(2)}`);
  
  const maxBalance = Math.max(...trades.map(t => parseFloat(t.accountBalance || "0")));
  const minBalance = Math.min(...trades.map(t => parseFloat(t.accountBalance || "0")));
  
  console.log(`Pico máximo alcanzado: $${maxBalance.toFixed(2)}`);
  console.log(`Valle mínimo alcanzado: $${minBalance.toFixed(2)}`);
  
  const fromPeak = lastBalance - maxBalance;
  console.log(`Distancia para recuperar el pico máximo: $${fromPeak.toFixed(2)}`);
}

run().then(() => process.exit(0));
