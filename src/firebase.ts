import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { Resource } from "sst";

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

export async function sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
  if (!messaging) {
    console.warn('Firebase Messaging not initialized. Skipping push notification.');
    return;
  }
  if (!fcmToken) return;

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
  } catch (error) {
    console.error(`Failed to send push notification:`, error);
  }
}
