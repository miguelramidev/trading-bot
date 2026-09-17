import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)]
  });
  
  const zec = trades.find(t => t.symbol.includes("ZEC"));
  if (zec) {
     console.log("ULTIMA SEÑAL DE ZEC:");
     console.log(JSON.stringify(zec, null, 2));
  } else {
     console.log("No se encontró ZEC en el historial reciente.");
  }
}

run().then(() => process.exit(0));
