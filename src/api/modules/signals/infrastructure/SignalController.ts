import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory, userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "../../../core/utils/encryption.js";
import { Trader } from "../../../../bot/trader.js";
import { sendCriticalAlert } from "../../../../bot/criticalAlert.js";
import { internalError, newErrorId } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";

export const signalsRouter = new Hono<AuthEnv>();

// POST /api/signals/:id/execute
signalsRouter.post(
  "/:id/execute",
  zValidator("param", z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    const firebaseUid = c.get("uid");

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

      // "rechazado" es el único caso sin posición real abierta en Binance.
      const finalDecision = executionResult.status === "rechazado" ? "Descartada" : "Tomada";
      const reasonText = executionResult.mensaje.substring(0, 100);

      await db.update(signalHistory)
        .set({ decision: finalDecision, reason: reasonText, isActiveTrade: true })
        .where(eq(signalHistory.id, id));

      // Los rechazos de negocio (saldo, capital) se muestran tal cual; el detalle de un error fatal
      // (texto de Binance/ccxt) queda solo en el log, con una referencia para el cliente.
      let clientMessage = executionResult.mensaje;
      if (executionResult.mensaje.startsWith("❌ Error Fatal")) {
        const errorId = newErrorId();
        console.error(`[${errorId}] executeTrade falló para la señal ${id}: ${executionResult.mensaje}`);
        clientMessage = `❌ Error al ejecutar la orden (ref ${errorId}). Revisa tu posición en Binance antes de reintentar.`;
      }

      if (executionResult.status === "critico") {
        await sendCriticalAlert(user.chatId, user.fcmTokens, executionResult.mensaje);
      }

      // Compatibilidad: la app Flutter actual solo entiende "success"/"error" en `status`.
      // `resultado` lleva los 4 estados nuevos para cuando el front-end se actualice (paso aparte).
      return c.json({
        status: executionResult.status === "rechazado" ? "error" : "success",
        message: clientMessage,
        resultado: executionResult.status,
      });

    } catch (e: any) {
      return internalError(c, e, `signals/${id}/execute`);
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
      return internalError(c, e, `signals/${id}/discard`);
    }
  }
);
