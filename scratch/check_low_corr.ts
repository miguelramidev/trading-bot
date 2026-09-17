import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const lowCorr = trades
    .map(t => {
      let corrStr = t.btcCorrelation || "0%";
      if (corrStr === "N/A") corrStr = "0%";
      return { symbol: t.symbol, corr: parseFloat(corrStr.replace("%", "")), dir: t.direction };
    })
    .filter(t => t.corr < 50)
    .sort((a, b) => a.corr - b.corr);
    
  console.log(`Encontradas ${lowCorr.length} operaciones con correlación < 50%:`);
  console.table(lowCorr);
}

run().then(() => process.exit(0));
