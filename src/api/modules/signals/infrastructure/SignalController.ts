import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory } from "../../../../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { decrypt } from "../../../core/utils/encryption.js";
import { userConfig } from "../../../../db/schema.js";
import { Trader } from "../../../../bot/trader.js";


export const signalsRouter = new Hono();

// GET /api/signals
// Retorna las últimas señales con páginación básica
signalsRouter.get(
  "/",
  zValidator("query", z.object({
    limit: z.string().optional().default("50"),
  })),
  async (c) => {
    const { limit: queryLimit } = c.req.valid("query");
    
    // Aquí idealmente llamaríamos al Application Service, pero 
    // para empezar conectamos el Repository/DB directo.
    const signals = await db.query.signalHistory.findMany({
      orderBy: [desc(signalHistory.evaluatedAt)],
      limit: parseInt(queryLimit)
    });
    
    return c.json({ data: signals });
  }
);

// GET /api/signals/:id
signalsRouter.get(
  "/:id",
  zValidator("param", z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    
    const signal = await db.query.signalHistory.findFirst({
      where: eq(signalHistory.id, id)
    });
    
    if (!signal) {
      return c.json({ error: "Signal not found" }, 404);
    }
    
    return c.json({ data: signal });
  }
);


// POST /api/signals/:id/execute
signalsRouter.post(
  "/:id/execute",
  zValidator("param", z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    const firebaseUid = authHeader.split(" ")[1];

    try {
      const user = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
      if (!user) return c.json({ error: "User not found" }, 404);
      if (!user.binanceApiKey || (!user.binanceApiSecret && !user.rsaPrivateKey)) {
          return c.json({ error: "API keys not configured" }, 400);
      }

      const signal = await db.query.signalHistory.findFirst({ where: eq(signalHistory.id, id) });
      if (!signal) return c.json({ error: "Signal not found" }, 404);
      if (signal.decision) return c.json({ error: "Signal already processed" }, 400);

      const apiKey = decrypt(user.binanceApiKey);
      const secret = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : decrypt(user.binanceApiSecret!);

      const trader = new Trader(apiKey, secret);
      const executionResult = await trader.executeTrade(
        signal.symbol,
        signal.direction!,
        parseFloat(signal.gridSL || signal.stopLoss || "0"),
        parseFloat(signal.gridTP || signal.takeProfit || "0"),
        user.montoOperacion ?? 25.0,
        user.leverageMin ?? 1,
        user.leverageMax ?? 2
      );

      let finalDecision = "Tomada";
      let reasonText = "Ejecutado vía Web Dashboard";

      if (executionResult.includes("❌")) {
          finalDecision = "Descartada";
          reasonText = executionResult.substring(0, 100);
      }

      await db.update(signalHistory)
        .set({ decision: finalDecision, reason: reasonText, isActiveTrade: true })
        .where(eq(signalHistory.id, id));

      return c.json({ status: finalDecision === "Tomada" ? "success" : "error", message: executionResult });

    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  }
);

// POST /api/signals/:id/discard
signalsRouter.post(
  "/:id/discard",
  zValidator("param", z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);

    try {
      const signal = await db.query.signalHistory.findFirst({ where: eq(signalHistory.id, id) });
      if (!signal) return c.json({ error: "Signal not found" }, 404);
      if (signal.decision) return c.json({ error: "Signal already processed" }, 400);

      let reasonText = "Descartado vía Web Dashboard";
      try {
        const body = await c.req.json();
        if (body && body.reason && body.reason.trim().length > 0) {
            reasonText = body.reason.trim();
        }
      } catch (e) {
        // Ignorar si no hay body JSON válido
      }

      await db.update(signalHistory)
        .set({ decision: "Descartada", reason: reasonText, isActiveTrade: false })
        .where(eq(signalHistory.id, id));

      return c.json({ status: "success", message: "Trade descartado" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  }
);
