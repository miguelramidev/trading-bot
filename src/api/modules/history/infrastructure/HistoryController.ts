import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory, userConfig } from "../../../../db/schema.js";
import { desc, eq, and, isNotNull, gte, type SQL } from "drizzle-orm";
import { internalError } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";
import { periodCutoff, filterTradesBySearch, filterTradesByType, computeHistoryStats } from "./historyHelpers.js";

export const historyRouter = new Hono<AuthEnv>();

historyRouter.get(
  "/",
  zValidator("query", z.object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("20"),
    filter: z.string().optional().default("Todos"), // "Todos", "Tomadas", "Descartadas" — solo filtra la lista, no las métricas
    period: z.enum(["all", "7d", "30d"]).optional().default("all"),
    symbol: z.string().optional(),
    strategy: z.string().optional(),
  })),
  async (c) => {
    const firebaseUid = c.get("uid");

    const { page, limit, filter, period, symbol, strategy } = c.req.valid("query");
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const cutoff = periodCutoff(period);

    try {
      const user = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
      if (!user) return c.json({ error: "User not found" }, 404);

      const closedConditions: SQL[] = [
        isNotNull(signalHistory.decision),
        eq(signalHistory.isActiveTrade, false),
      ];
      if (cutoff) closedConditions.push(gte(signalHistory.evaluatedAt, cutoff));

      const allSignals = await db.query.signalHistory.findMany({
        where: and(...closedConditions),
        orderBy: [desc(signalHistory.evaluatedAt)],
      });

      // Para "N de M señales en el período": total evaluado en la ventana, sin importar si cerró o no.
      const periodSignals = await db.query.signalHistory.findMany({
        where: cutoff ? gte(signalHistory.evaluatedAt, cutoff) : undefined,
        columns: { id: true },
      });

      const mappedTrades = allSignals.map(t => {
        let statusStr: "DESCARTADO" | "TP HIT" | "SL HIT" = "DESCARTADO";
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
          } else {
            statusStr = "SL HIT";
          }
          roi = roiVal;
          pnl = pnlVal;
        }

        return {
          id: t.id,
          symbol: t.symbol,
          direction: t.direction,
          leverage: null, // signalHistory no guarda el apalancamiento usado (ver ROADMAP.md)
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

      // Búsqueda por activo/estrategia: acota también las métricas (siguen a
      // período + búsqueda). El filtro de tipo, más abajo, solo acota la lista.
      const searchFiltered = filterTradesBySearch(mappedTrades, { symbol, strategy });
      const stats = computeHistoryStats(searchFiltered);
      const filteredTrades = filterTradesByType(searchFiltered, filter);

      // Pagination
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedTrades = filteredTrades.slice(startIndex, startIndex + limitNum);

      return c.json({
        stats: {
          totalTrades: stats.totalTrades,
          winningTrades: stats.winningTrades,
          losingTrades: stats.losingTrades,
          winRate: stats.winRate.toFixed(1),
          totalPnl: stats.totalPnl.toFixed(2),
          profitFactor: stats.profitFactor.toFixed(2),
          grossProfit: stats.grossProfit.toFixed(2),
          grossLoss: stats.grossLoss.toFixed(2),
          periodSignalsCount: periodSignals.length,
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
      return internalError(c, e, "history list");
    }
  }
);

// GET /api/history/:id — Secure single trade fetch (only owner can access)
historyRouter.get(
  "/:id",
  async (c) => {
    const firebaseUid = c.get("uid");

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
        leverage: null, // signalHistory no guarda el apalancamiento usado (ver ROADMAP.md)
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
      return internalError(c, e, "history detail");
    }
  }
);
