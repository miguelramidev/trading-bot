import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { isNotNull, desc } from "drizzle-orm";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    where: isNotNull(signalHistory.realizedPnl),
    orderBy: [desc(signalHistory.id)]
  });
  
  let wins = 0;
  let losses = 0;
  
  let stats = {
    longs: { w: 0, l: 0 },
    shorts: { w: 0, l: 0 },
    strat1: { w: 0, l: 0 },
    strat2: { w: 0, l: 0 },
    strat3: { w: 0, l: 0 },
    strat4: { w: 0, l: 0 },
  };

  trades.forEach(t => {
     // Ignore breakeven exactly 0 if it's from old legacy code, but wait, Shadow trades are calculated exactly.
     const pnl = parseFloat(t.realizedPnl || "0");
     if (pnl === 0) return; // Skip 0s
     
     const isWin = pnl > 0;
     if (isWin) wins++; else losses++;
     
     if (t.direction === "LONG") { isWin ? stats.longs.w++ : stats.longs.l++; }
     if (t.direction === "SHORT") { isWin ? stats.shorts.w++ : stats.shorts.l++; }
     
     if (t.strategy === "1") { isWin ? stats.strat1.w++ : stats.strat1.l++; }
     if (t.strategy === "2") { isWin ? stats.strat2.w++ : stats.strat2.l++; }
     if (t.strategy === "3") { isWin ? stats.strat3.w++ : stats.strat3.l++; }
     if (t.strategy === "4") { isWin ? stats.strat4.w++ : stats.strat4.l++; }
  });
  
  console.log(`Total Wins: ${wins}, Total Losses: ${losses}`);
  console.log("Stats:", JSON.stringify(stats, null, 2));
}
run().then(() => process.exit(0));
