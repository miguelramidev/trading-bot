import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import ccxt from "ccxt";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.symbol, "MAGMA/USDT:USDT"),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 1
  });
  
  if (trades.length === 0) return console.log("No Magma found");
  const magma = trades[0];
  console.log("MAGMA:", magma);
  
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const candles = await exchange.fetchOHLCV("MAGMA/USDT", '1m', magma.evaluatedAt.getTime(), 1000);
  
  let endReason = "AUN ACTIVO";
  const sl = parseFloat(magma.gridSL!);
  const tp = parseFloat(magma.gridTP!);
  console.log(`Buscando SL: ${sl} o TP: ${tp} (Direction: ${magma.direction})`);
  
  for(const c of candles) {
    const high = c[2] as number;
    const low = c[3] as number;
    if (magma.direction === "SHORT") {
       if (high >= sl) { endReason = "SL Tocado"; break; }
       if (low <= tp) { endReason = "TP Tocado"; break; }
    }
  }
  
  console.log("Resultado Teórico:", endReason);
}
run().then(() => process.exit(0));
