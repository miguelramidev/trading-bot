import { Hono } from "hono";
import { db } from "../../../../db/index.js";
import { signalHistory, userConfig } from "../../../../db/schema.js";
import { desc, eq, and, isNotNull, ne } from "drizzle-orm";

export const historyRouter = new Hono();

historyRouter.get("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const firebaseUid = authHeader.split(" ")[1];

  try {
    const user = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Get all signals that have a decision
    const allSignals = await db.query.signalHistory.findMany({
      where: isNotNull(signalHistory.decision),
      orderBy: [desc(signalHistory.evaluatedAt)],
    });

    // Filter to only history (inactive trades or discarded)
    const historyTrades = allSignals.filter(s => s.isActiveTrade === false);

    // Calculate Stats
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalPnl = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    const mappedTrades = historyTrades.map(t => {
      let statusStr = "DESCARTADO";
      let roi = 0;
      let pnl = 0;
      
      const pnlVal = parseFloat(t.realizedPnl || "0");
      const roiVal = parseFloat(t.realizedRoi || "0");

      if (t.decision === "Descartada" || t.decision === "Ignorada") {
        statusStr = "DESCARTADO";
      } else if (t.decision?.includes("Cerrada")) {
        if (pnlVal > 0 || t.decision.includes("TP")) {
          statusStr = "TP HIT";
          winningTrades++;
          grossProfit += pnlVal;
        } else {
          statusStr = "SL HIT";
          losingTrades++;
          grossLoss += Math.abs(pnlVal);
        }
        totalTrades++;
        totalPnl += pnlVal;
        roi = roiVal;
        pnl = pnlVal;
      }

      return {
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: t.accountBalance && t.minNotional ? Math.ceil(parseFloat(t.minNotional) / parseFloat(t.accountBalance)) : 1, // rough estimate of leverage used
        strategy: t.strategy || t.regime || "Strategy",
        entryPrice: t.executedEntryPrice || t.entry || "0",
        exitPrice: t.executedExitPrice || "-",
        roi: roi,
        pnl: pnl,
        status: statusStr,
        date: t.evaluatedAt,
        reason: t.reason
      };
    });

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);

    return c.json({
      stats: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: winRate.toFixed(1),
        totalPnl: totalPnl.toFixed(2),
        profitFactor: profitFactor.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        grossLoss: grossLoss.toFixed(2)
      },
      trades: mappedTrades
    });

  } catch (e: any) {
    console.error("History error:", e);
    return c.json({ error: e.message }, 500);
  }
});
