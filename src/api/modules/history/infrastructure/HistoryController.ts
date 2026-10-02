import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory, userConfig } from "../../../../db/schema.js";
import { desc, eq, and, isNotNull, gte, type SQL } from "drizzle-orm";
import { internalError } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";
import { periodCutoff, filterTradesBySearch, filterTradesByType, computeHistoryStats, computeAvailableStrategies, classifyTradeStatus } from "./historyHelpers.js";

export const historyRouter = new Hono<AuthEnv>();

historyRouter.get(
  "/",
  zValidator("query", z.object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("20"),
    filter: z.string().optional().default("Todos"), // "Todos", "Tomadas", "Descartadas", "Rechazadas" — solo filtra la lista, no las métricas
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
        // null, no 0: `realized_roi`/`realized_pnl` pueden venir null incluso en una señal YA
        // EJECUTADA (hallazgo de la skill auditoria-trades: roto desde el refactor multi-tenant
        // del 25/09) — "|| '0'" lo disfrazaba de 0.00%.
        const pnlVal = t.realizedPnl != null ? parseFloat(t.realizedPnl) : null;
        const roiVal = t.realizedRoi != null ? parseFloat(t.realizedRoi) : null;

        // El query de arriba ya filtra isActiveTrade=false, así que nunca sale "ACTIVA" acá.
        const statusStr = classifyTradeStatus({ decision: t.decision, pnl: pnlVal, isActiveTrade: false }) as "DESCARTADO" | "RECHAZADO" | "TP HIT" | "SL HIT";
        // null, no 0: una descartada/rechazada no tiene resultado, "0.00%" mentiría que sí lo tiene.
        const roi = statusStr === "TP HIT" || statusStr === "SL HIT" ? roiVal : null;
        const pnl = statusStr === "TP HIT" || statusStr === "SL HIT" ? pnlVal : null;

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
          reason: t.reason,
          // El Detalle de señal necesita saber si de verdad se ejecutó (no
          // solo el `status` derivado de arriba, que no distingue "activa").
          decision: t.decision,
          isActiveTrade: t.isActiveTrade,
          // Contexto de la señal: faltaba acá, así que el Detalle de señal
          // abierto desde Historial lo mostraba vacío.
          btcRegime: t.btcRegime,
          bias4h: t.bias4h,
          btcCorrelation: t.btcCorrelation,
          triggerRsi: t.triggerRsi,
          triggerAdx: t.triggerAdx,
          // Fase 1 (advertencias): null en señales viejas, la app cae a
          // parsear `reason` por viñetas en ese caso.
          warnings: t.warnings,
        };
      });

      // Estrategias del selector: del período visto, ANTES de que la búsqueda
      // por estrategia las acote (si no, elegir una ya las haría desaparecer
      // a todas menos ella).
      const availableStrategies = computeAvailableStrategies(mappedTrades);

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
        availableStrategies,
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

      // null, no 0: `realized_roi`/`realized_pnl` pueden venir null incluso en una señal YA
      // EJECUTADA (ver historyHelpers: roto desde el refactor multi-tenant del 25/09) — "|| '0'"
      // lo disfrazaba de 0.
      const rawPnl = t.realizedPnl != null ? parseFloat(t.realizedPnl) : null;
      const rawRoi = t.realizedRoi != null ? parseFloat(t.realizedRoi) : null;

      const statusStr = classifyTradeStatus({ decision: t.decision, pnl: rawPnl, isActiveTrade: t.isActiveTrade });
      // null, no 0: una descartada/rechazada/activa no tiene resultado todavía.
      const pnlVal = statusStr === "TP HIT" || statusStr === "SL HIT" ? rawPnl : null;
      const roiVal = statusStr === "TP HIT" || statusStr === "SL HIT" ? rawRoi : null;

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
        reason: t.reason,
        decision: t.decision,
        isActiveTrade: t.isActiveTrade,
        btcRegime: t.btcRegime,
        bias4h: t.bias4h,
        btcCorrelation: t.btcCorrelation,
        triggerRsi: t.triggerRsi,
        triggerAdx: t.triggerAdx,
        warnings: t.warnings,
      });

    } catch (e: any) {
      return internalError(c, e, "history detail");
    }
  }
);
