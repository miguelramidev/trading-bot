import { encrypt, decrypt } from "../../../core/utils/encryption.js";
import crypto from "crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import ccxt from "ccxt";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";
import { internalError } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";
import { validateCapitalRisk } from "./configValidation.js";
import { MIN_SL_DISTANCE_PCT, MIN_EFFECTIVE_RR, MAX_SIGNAL_AGE_MS } from "../../../../bot/trader.js";

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

    const updated = await db.update(userConfig)
      .set({
        rsaPublicKey: publicKey,
        rsaPrivateKey: encrypt(privateKey),
      })
      .where(eq(userConfig.firebaseUid, firebaseUid))
      .returning({ id: userConfig.id });

    // Sin fila del usuario no se guardó nada: no se puede devolver una clave pública que no quedó registrada.
    if (updated.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

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

    // Restricciones reales de la API key en Binance (retiros habilitados, futuros
    // habilitados). Timeout corto a propósito: esto es un dato informativo de la
    // pantalla de Configuración, no puede demorar la carga completa del formulario.
    // Si falla o tarda, `null` — nunca un valor supuesto.
    const binanceKeyInfo = await fetchBinanceKeyInfo(user);

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
        binanceKeyInfo,
        // RULES.md Reglas 5/7/8: umbrales de protección de `executeTrade`, no son
        // configurables por usuario — viajan acá para que la app avise y deshabilite el
        // botón de operar ANTES de intentar, en vez de duplicar estos números a mano.
        minSlDistancePct: MIN_SL_DISTANCE_PCT,
        minEffectiveRR: MIN_EFFECTIVE_RR,
        maxSignalAgeMinutes: MAX_SIGNAL_AGE_MS / 60_000,
      }
    });
  } catch (error: any) {
    return internalError(c, error, "users/config GET");
  }
});

/** `null` si no hay keys, si la consulta falla, o si tarda más de 2s. */
async function fetchBinanceKeyInfo(user: typeof userConfig.$inferSelect): Promise<{ futuresEnabled: boolean; withdrawalsDisabled: boolean } | null> {
  if (!user.binanceApiKey || (!user.binanceApiSecret && !user.rsaPrivateKey)) return null;

  try {
    const apiKey = decrypt(user.binanceApiKey);
    const secret = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : decrypt(user.binanceApiSecret!);
    const binance = new ccxt.binance({
      apiKey,
      secret,
      enableRateLimit: true,
      timeout: 2000,
      options: { defaultType: "future" },
    });

    const restrictions: any = await binance.sapiGetAccountApiRestrictions();
    return {
      futuresEnabled: restrictions?.enableFutures === true,
      withdrawalsDisabled: restrictions?.enableWithdrawals === false,
    };
  } catch (e) {
    return null;
  }
}

// PUT /api/users/config
usersRouter.put(
  "/config",
  zValidator("json", z.object({
    binanceApiKey: z.string().optional(),
    binanceApiSecret: z.string().optional(),
    montoOperacion: z.number().positive().optional(),
    apalancamiento: z.number().optional(),
    leverageMin: z.number().int().min(1).max(10).optional(),
    leverageMax: z.number().int().min(1).max(10).optional(),
    maxTrades: z.number().int().min(1).max(10).optional(),
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
      // Hallazgo M6: valida el resultado COMBINADO (lo guardado + los cambios de
      // este PUT), no cada campo aislado — así un PUT que solo manda `leverageMax`
      // por debajo del `leverageMin` ya guardado también se rechaza.
      const touchesCapitalRisk =
        data.montoOperacion !== undefined ||
        data.maxTrades !== undefined ||
        data.leverageMin !== undefined ||
        data.leverageMax !== undefined;

      if (touchesCapitalRisk) {
        const current = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, firebaseUid) });
        if (!current) return c.json({ error: "User not found" }, 404);

        const merged = {
          montoOperacion: data.montoOperacion ?? current.montoOperacion ?? 25,
          maxTrades: data.maxTrades ?? current.maxTrades ?? 5,
          leverageMin: data.leverageMin ?? current.leverageMin ?? 1,
          leverageMax: data.leverageMax ?? current.leverageMax ?? 2,
        };
        const validationError = validateCapitalRisk(merged);
        if (validationError) {
          return c.json({ error: validationError }, 400);
        }
      }

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
