import { encrypt } from "../../../core/utils/encryption.js";
import crypto from "crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";

import { SyncUserUseCase } from "../application/SyncUserUseCase.js";
import { PostgresUserRepository } from "./PostgresUserRepository.js";

export const usersRouter = new Hono();

// Configuración de Inyección de Dependencias (SOLID)
const userRepository = new PostgresUserRepository();
const syncUserUseCase = new SyncUserUseCase(userRepository);

// POST /api/users/sync
usersRouter.post(
  "/sync",
  zValidator("json", z.object({
    firebaseUid: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
  })),
  async (c) => {
    const data = c.req.valid("json");
    try {
      const user = await syncUserUseCase.execute(data);
      return c.json({ success: true, user });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }
);

// GET /api/users
usersRouter.get("/", async (c) => {
    const users = await db.query.userConfig.findMany();
    return c.json({ data: users });
});

// PATCH /api/users/:chatId/pause
usersRouter.patch(
  "/:chatId/pause",
  zValidator("param", z.object({
    chatId: z.string(),
  })),
  zValidator("json", z.object({
    isPaused: z.boolean(),
  })),
  async (c) => {
    const { chatId } = c.req.valid("param");
    const { isPaused } = c.req.valid("json");
    
    await db.update(userConfig)
      .set({ isPaused })
      .where(eq(userConfig.chatId, chatId));
      
    return c.json({ success: true, isPaused });
  }
);


// POST /api/users/keys/generate
usersRouter.post("/keys/generate", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const firebaseUid = authHeader.split(" ")[1];

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
    return c.json({ success: false, error: e.message }, 500);
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
    maxTrades: z.number().optional(),
    rsaPublicKey: z.string().optional(),
    rsaPrivateKey: z.string().optional(),
  })),
  async (c) => {
    // 1. Autenticación / Middleware casero
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const firebaseUid = authHeader.split(" ")[1];

    // 2. Validación y actualización
    const data = c.req.valid("json");
    try {
      const setObj: any = {};
      if (data.binanceApiKey) setObj.binanceApiKey = encrypt(data.binanceApiKey);
      if (data.binanceApiSecret) setObj.binanceApiSecret = encrypt(data.binanceApiSecret);
      if (data.montoOperacion !== undefined) setObj.montoOperacion = data.montoOperacion;
      if (data.apalancamiento !== undefined) setObj.apalancamiento = data.apalancamiento;
      if (data.maxTrades !== undefined) setObj.maxTrades = data.maxTrades;
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
      return c.json({ success: false, error: error.message }, 500);
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
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const firebaseUid = authHeader.split(" ")[1];
    const { token } = c.req.valid("json");

    try {
      await db.update(userConfig)
        .set({ fcmToken: token, updatedAt: new Date() })
        .where(eq(userConfig.firebaseUid, firebaseUid));

      return c.json({ success: true, message: "FCM token updated successfully" });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }
);
