import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 5
  });
  
  const tia = trades.find(t => t.symbol.includes("TIA"));
  if (tia) {
      console.log(`TIA encontrado:`);
      console.log(`Símbolo: ${tia.symbol}`);
      console.log(`Dirección: ${tia.direction}`);
      console.log(`Régimen: ${tia.regime}`);
      console.log(`Estrategia: ${tia.strategy}`);
      console.log(`Motivo: ${tia.reason}`);
      console.log(`Correlación: ${tia.btcCorrelation}`);
      console.log(`SL: ${tia.gridSL} | TP: ${tia.gridTP}`);
  } else {
      console.log("No se encontró TIA en los últimos trades.");
  }
}
run().then(() => process.exit(0));
