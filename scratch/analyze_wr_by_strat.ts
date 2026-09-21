import { db } from "../src/db/index.js";

async function run() {
  const trades = await db.query.signalHistory.findMany();
  
  const stats = {
    "1": { wins: 0, losses: 0, total: 0 },
    "2": { wins: 0, losses: 0, total: 0 },
    "3": { wins: 0, losses: 0, total: 0 },
    "4": { wins: 0, losses: 0, total: 0 },
  };

  for (const t of trades) {
      if (!t.decision) continue;
      
      const hitSL = t.decision.includes("SL Tocado");
      const hitTP = t.decision.includes("TP Tocado");
      if (!hitSL && !hitTP) continue;
      
      let frVal = 0;
      if (t.fundingRate && t.fundingRate !== "N/A") {
          frVal = parseFloat(t.fundingRate.replace("%", ""));
      }
      
      // Determine what strategy it ACTUALLY is (for retrocompatibility with older trades)
      let actualStrat = t.strategy || "Unknown";
      
      // If it's an old trade, we retroactively apply Strategy 4 logic if applicable
      let strat4Flipped = false;
      if (t.direction === "LONG" && frVal > 0) strat4Flipped = true;
      if (t.direction === "SHORT" && frVal < 0) strat4Flipped = true;

      // If it was flipped retroactively and strategy isn't explicitly 4 yet, consider it Strat 4
      if (strat4Flipped) actualStrat = "4";
      
      let weWon = false;
      if (!strat4Flipped || t.strategy === "4") {
          // If it was natively Strat 4, or not flipped
          if (hitTP) weWon = true;
          if (hitSL) weWon = false;
      } else {
          // Retroactively flipped
          if (hitSL) weWon = true;
          if (hitTP) weWon = false;
      }
      
      if (!stats[actualStrat]) stats[actualStrat] = { wins: 0, losses: 0, total: 0 };
      
      stats[actualStrat].total++;
      if (weWon) stats[actualStrat].wins++;
      else stats[actualStrat].losses++;
  }
  
  console.log(`\n=== WIN RATE POR ESTRATEGIA ===\n`);
  for (const strat of ["1", "2", "3", "4"]) {
     const st = stats[strat];
     if (st && st.total > 0) {
        const wr = (st.wins / st.total) * 100;
        console.log(`Estrategia ${strat}:`);
        console.log(`  Operaciones: ${st.total}`);
        console.log(`  Victorias:   ${st.wins}`);
        console.log(`  Derrotas:    ${st.losses}`);
        console.log(`  Win Rate:    ${wr.toFixed(2)}%\n`);
     } else {
        console.log(`Estrategia ${strat}: Sin datos suficientes.\n`);
     }
  }
}
run().then(() => process.exit(0));
