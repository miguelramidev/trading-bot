import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { Resource } from "sst";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { userConfig } from "./db/schema.js";

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || (Resource as any).FIREBASE_SERVICE_ACCOUNT_B64?.value;

if (!getApps().length) {
  if (serviceAccountBase64) {
    try {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('Firebase Admin Initialized Successfully.');
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_B64', e);
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_B64 is not set. Push notifications will be disabled.');
  }
}

export const messaging: Messaging | null = (getApps().length > 0) ? getMessaging() : null;

// Códigos de error de Firebase Admin que significan "este token ya no sirve, nunca más va a
// funcionar" (vs. un error transitorio de red/cuota) — ver incidente QNT, 2026-10-02: el usuario
// tenía 6 tokens FCM acumulados (de reinstalaciones/dispositivos viejos) y una sola alerta
// terminaba mandando hasta 6 pushes. Nunca se podaban los inválidos.
const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export interface SendPushResult {
  sent: boolean;
  /** `true` si Firebase confirmó que el token ya no sirve — el llamador debería podarlo con `removeFcmToken`. */
  invalidToken: boolean;
}

export async function sendPushNotification(fcmToken: string, title: string, body: string, data?: any): Promise<SendPushResult> {
  if (!messaging) {
    console.warn('Firebase Messaging not initialized. Skipping push notification.');
    return { sent: false, invalidToken: false };
  }
  if (!fcmToken) return { sent: false, invalidToken: false };

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: data || {},
      android: {
        priority: "high",
        notification: {
            channelId: "macroquant_alerts_v2",
            icon: "notification_icon",
            sound: "default"
        }
      },
      webpush: {
        headers: {
            Urgency: "high"
        }
      }
    });
    console.log(`Push notification sent successfully.`);
    return { sent: true, invalidToken: false };
  } catch (error: any) {
    const invalidToken = INVALID_TOKEN_ERROR_CODES.has(error?.code);
    console.error(`Failed to send push notification${invalidToken ? " (token inválido, se va a podar)" : ""}:`, error);
    return { sent: false, invalidToken };
  }
}

/** Saca un token FCM inválido de `user_config.fcm_tokens`. Idempotente: si el token ya no está
 * (otra llamada concurrente ya lo sacó), no hace ningún UPDATE de más. */
export async function removeFcmToken(userId: number, token: string): Promise<void> {
  const user = await db.query.userConfig.findFirst({ where: eq(userConfig.id, userId) });
  if (!user?.fcmTokens || !user.fcmTokens.includes(token)) return;

  const updated = user.fcmTokens.filter((t) => t !== token);
  await db.update(userConfig).set({ fcmTokens: updated }).where(eq(userConfig.id, userId));
  console.log(`[fcm] Token inválido eliminado para el usuario ${userId}.`);
}

/** Envía el push y, si Firebase confirma que el token ya no sirve, lo poda de una — para no
 * repetir este patrón en cada llamador (analyze.ts, reconciliation.ts, criticalAlert.ts). */
export async function sendPushNotificationAndPrune(
  userId: number,
  fcmToken: string,
  title: string,
  body: string,
  data?: any
): Promise<void> {
  const result = await sendPushNotification(fcmToken, title, body, data);
  if (result.invalidToken) {
    await removeFcmToken(userId, fcmToken);
  }
}
