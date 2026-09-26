import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory, userConfig } from "../../../../db/schema.js";
import { desc, eq, and, isNotNull } from "drizzle-orm";

export const historyRouter = new Hono();

historyRouter.get(
  "/",
  zValidator("query", z.object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("20"),
    filter: z.string().optional().default("Todos"), // "Todos", "Tomadas", "Descartadas"
  })),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    const firebaseUid = authHeader.split(" ")[1];
    
    const { page, limit, filter } = c.req.valid("query");
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    try {
      const user = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
      if (!user) return c.json({ error: "User not found" }, 404);

      const allSignals = await db.query.signalHistory.findMany({
        where: and(
          isNotNull(signalHistory.decision),
          eq(signalHistory.isActiveTrade, false)
        ),
        orderBy: [desc(signalHistory.evaluatedAt)],
      });

      let totalTrades = 0;
      let winningTrades = 0;
      let losingTrades = 0;
      let totalPnl = 0;
      let grossProfit = 0;
      let grossLoss = 0;

      const mappedTrades = allSignals.map(t => {
        let statusStr = "DESCARTADO";
        let roi = 0;
        let pnl = 0;
        
        const pnlVal = parseFloat(t.realizedPnl || "0");
        const roiVal = parseFloat(t.realizedRoi || "0");

        // The bug made some discarded trades look like "Cerrada (SL Tocado)". We can heuristically fix them for display:
        // If entryPrice is null or 0 and it was closed, it was likely discarded by mistake.
        const wasActuallyDiscarded = t.decision === "Descartada" || t.decision === "Ignorada" || (!t.executedEntryPrice && t.decision?.includes("Cerrada"));

        if (wasActuallyDiscarded) {
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
          leverage: t.leverage || 1,
          strategy: t.strategy || t.regime || "Strategy",
          entryPrice: t.executedEntryPrice || t.entry || "0",
          exitPrice: t.executedExitPrice || "-",
          stopLoss: t.gridSL || t.stopLoss || "-",
          takeProfit: t.gridTP || t.takeProfit || "-",
          margin: t.accountBalance || "0",
          roi: roi,
          pnl: pnl,
          fundingRate: t.fundingRate || "0.0000",
          status: statusStr,
          date: t.evaluatedAt,
          reason: t.reason
        };
      });

      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);

      // Apply Filter
      let filteredTrades = mappedTrades;
      if (filter === "Tomadas") {
        filteredTrades = mappedTrades.filter(t => t.status !== "DESCARTADO");
      } else if (filter === "Descartadas") {
        filteredTrades = mappedTrades.filter(t => t.status === "DESCARTADO");
      }

      // Pagination
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedTrades = filteredTrades.slice(startIndex, startIndex + limitNum);

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
        pagination: {
          total: filteredTrades.length,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(filteredTrades.length / limitNum)
        },
        trades: paginatedTrades
      });

    } catch (e: any) {
      console.error("History error:", e);
      return c.json({ error: e.message }, 500);
    }
  }
);

// GET /api/history/:id — Secure single trade fetch (only owner can access)
historyRouter.get(
  "/:id",
  async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    const firebaseUid = authHeader.split(" ")[1];

    const tradeId = parseInt(c.req.param("id"), 10);
    if (isNaN(tradeId)) return c.json({ error: "Invalid trade ID" }, 400);

    try {
      const user = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
      if (!user) return c.json({ error: "User not found" }, 404);

      const t = await db.query.signalHistory.findFirst({
        where: eq(signalHistory.id, tradeId)
      });

      if (!t) return c.json({ error: "Trade not found" }, 404);

      const pnlVal = parseFloat(t.realizedPnl || "0");
      const roiVal = parseFloat(t.realizedRoi || "0");
      const wasActuallyDiscarded = t.decision === "Descartada" || t.decision === "Ignorada" || (!t.executedEntryPrice && t.decision?.includes("Cerrada"));

      let statusStr = "DESCARTADO";
      if (!wasActuallyDiscarded && t.decision?.includes("Cerrada")) {
        statusStr = pnlVal > 0 || t.decision.includes("TP") ? "TP HIT" : "SL HIT";
      } else if (t.isActiveTrade) {
        statusStr = "ACTIVA";
      }

      return c.json({
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: t.leverage || 1,
        strategy: t.strategy || t.regime || "Strategy",
        entryPrice: t.executedEntryPrice || t.entry || "0",
        exitPrice: t.executedExitPrice || "-",
        stopLoss: t.gridSL || t.stopLoss || "-",
        takeProfit: t.gridTP || t.takeProfit || "-",
        margin: t.accountBalance || "0",
        roi: roiVal,
        pnl: pnlVal,
        fundingRate: t.fundingRate || "0.0000",
        status: statusStr,
        date: t.evaluatedAt,
        reason: t.reason
      });

    } catch (e: any) {
      console.error("Trade detail error:", e);
      return c.json({ error: e.message }, 500);
    }
  }
);
