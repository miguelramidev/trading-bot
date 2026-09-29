import { encrypt } from "../../../core/utils/encryption.js";
import crypto from "crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";
import { internalError } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";

import { SyncUserUseCase } from "../application/SyncUserUseCase.js";
import { PostgresUserRepository } from "./PostgresUserRepository.js";

export const usersRouter = new Hono<AuthEnv>();

// Configuración de Inyección de Dependencias (SOLID)
const userRepository = new PostgresUserRepository();
const syncUserUseCase = new SyncUserUseCase(userRepository);

// POST /api/users/sync
// El uid y el email salen del token verificado; del body solo se acepta el nombre.
usersRouter.post(
  "/sync",
  zValidator("json", z.object({
    name: z.string().optional(),
  })),
  async (c) => {
    const firebaseUid = c.get("uid");
    const email = c.get("email");
    if (!email) return c.json({ error: "El token no incluye email" }, 400);

    const { name } = c.req.valid("json");
    try {
      const user = await syncUserUseCase.execute({ firebaseUid, email, name: name ?? c.get("name") });
      return c.json({ success: true, user });
    } catch (error: any) {
      return internalError(c, error, "users/sync");
    }
  }
);

// PATCH /api/users/bot-status — Activar/pausar el bot desde la app (por firebaseUid)
usersRouter.patch("/bot-status", zValidator("json", z.object({ isPaused: z.boolean() })), async (c) => {
  const firebaseUid = c.get("uid");
  const { isPaused } = c.req.valid("json");
  await db.update(userConfig).set({ isPaused }).where(eq(userConfig.firebaseUid, firebaseUid));
  return c.json({ success: true, isPaused });
});

// POST /api/users/keys/generate
usersRouter.post("/keys/generate", async (c) => {
  const firebaseUid = c.get("uid");

  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    await db.update(userConfig)
      .set({
        rsaPublicKey: publicKey,
        rsaPrivateKey: encrypt(privateKey),
      })
      .where(eq(userConfig.firebaseUid, firebaseUid));

    return c.json({ success: true, publicKey });
  } catch (e: any) {
    return internalError(c, e, "users/keys/generate");
  }
});

// GET /api/users/config
usersRouter.get("/config", async (c) => {
  const firebaseUid = c.get("uid");

  try {
    const user = await db.query.userConfig.findFirst({
      where: eq(userConfig.firebaseUid, firebaseUid),
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Retornamos la configuración, ocultando credenciales sensibles
    return c.json({
      success: true,
      data: {
        montoOperacion: user.montoOperacion,
        maxTrades: user.maxTrades,
        leverageMin: user.leverageMin,
        leverageMax: user.leverageMax,
        notificationsWeb: user.notificationsWeb,
        notificationsMobile: user.notificationsMobile,
        notificationsTelegram: user.notificationsTelegram,
        isPaused: user.isPaused,
        hasBinanceKeys: !!user.binanceApiKey && !!user.binanceApiSecret,
        hasRsaKeys: !!user.rsaPublicKey && !!user.rsaPrivateKey,
        rsaPublicKey: user.rsaPublicKey,
      }
    });
  } catch (error: any) {
    return internalError(c, error, "users/config GET");
  }
});

// PUT /api/users/config
usersRouter.put(
  "/config",
  zValidator("json", z.object({
    binanceApiKey: z.string().optional(),
    binanceApiSecret: z.string().optional(),
    montoOperacion: z.number().optional(),
    apalancamiento: z.number().optional(),
    leverageMin: z.number().min(1).max(125).optional(),
    leverageMax: z.number().min(1).max(125).optional(),
    maxTrades: z.number().optional(),
    notificationsWeb: z.boolean().optional(),
    notificationsMobile: z.boolean().optional(),
    notificationsTelegram: z.boolean().optional(),
    rsaPublicKey: z.string().optional(),
    rsaPrivateKey: z.string().optional(),
  })),
  async (c) => {
    const firebaseUid = c.get("uid");

    // Validación y actualización
    const data = c.req.valid("json");
    try {
      const setObj: any = {};
      if (data.binanceApiKey) setObj.binanceApiKey = encrypt(data.binanceApiKey);
      if (data.binanceApiSecret) setObj.binanceApiSecret = encrypt(data.binanceApiSecret);
      if (data.montoOperacion !== undefined) setObj.montoOperacion = data.montoOperacion;
      if (data.apalancamiento !== undefined) setObj.apalancamiento = data.apalancamiento;
      if (data.leverageMin !== undefined) setObj.leverageMin = data.leverageMin;
      if (data.leverageMax !== undefined) setObj.leverageMax = data.leverageMax;
      if (data.maxTrades !== undefined) setObj.maxTrades = data.maxTrades;
      if (data.notificationsWeb !== undefined) setObj.notificationsWeb = data.notificationsWeb;
      if (data.notificationsMobile !== undefined) setObj.notificationsMobile = data.notificationsMobile;
      if (data.notificationsTelegram !== undefined) setObj.notificationsTelegram = data.notificationsTelegram;
      if (data.rsaPublicKey) setObj.rsaPublicKey = data.rsaPublicKey;
      if (data.rsaPrivateKey) setObj.rsaPrivateKey = encrypt(data.rsaPrivateKey);

      const result = await db.update(userConfig)
        .set(setObj)
        .where(eq(userConfig.firebaseUid, firebaseUid))
        .returning();

      if (result.length === 0) {
        return c.json({ error: "User not found" }, 404);
      }

      return c.json({ success: true, message: "Configuration updated successfully" });
    } catch (error: any) {
      return internalError(c, error, "users/config PUT");
    }
  }
);


// POST /api/users/fcm-token
usersRouter.post(
  "/fcm-token",
  zValidator("json", z.object({
    token: z.string(),
  })),
  async (c) => {
    const firebaseUid = c.get("uid");
    const { token } = c.req.valid("json");

    try {
      const user = await db.query.userConfig.findFirst({
        where: eq(userConfig.firebaseUid, firebaseUid)
      });
      if (user) {
        let tokens = user.fcmTokens || [];
        if (!tokens.includes(token)) {
          tokens.push(token);
          await db.update(userConfig)
            .set({ fcmTokens: tokens, updatedAt: new Date() })
            .where(eq(userConfig.firebaseUid, firebaseUid));
        }
      }

      return c.json({ success: true, message: "FCM token updated successfully" });
    } catch (error: any) {
      return internalError(c, error, "users/fcm-token");
    }
  }
);
