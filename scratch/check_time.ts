import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq, or, ilike } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: or(
      ilike(signalHistory.symbol, 'BNB%'),
      ilike(signalHistory.symbol, 'HYPE%')
    ),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
  });
  
  const activeBNB = trades.find(t => t.symbol.includes('BNB') && t.isActiveTrade);
  const activeHYPE = trades.find(t => t.symbol.includes('HYPE') && t.isActiveTrade);
  
  const now = new Date();
  
  if (activeBNB) {
    const diff = now.getTime() - activeBNB.evaluatedAt.getTime();
    console.log(`BNB fue evaluada en: ${activeBNB.evaluatedAt.toISOString()}`);
    console.log(`Tiempo abierta BNB: ${(diff / (1000 * 60 * 60)).toFixed(2)} horas`);
  }
  
  if (activeHYPE) {
    const diff = now.getTime() - activeHYPE.evaluatedAt.getTime();
    console.log(`HYPE fue evaluada en: ${activeHYPE.evaluatedAt.toISOString()}`);
    console.log(`Tiempo abierta HYPE: ${(diff / (1000 * 60 * 60)).toFixed(2)} horas`);
  }
}
run().then(() => process.exit(0));
