import { db } from "../db/index.js";
import { userConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function handler(event: any) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, token } = body;

    if (!uid || !token) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing uid or token" }) };
    }

    await db.update(userConfig)
      .set({ fcmToken: token, updatedAt: new Date() })
      .where(eq(userConfig.firebaseUid, uid));

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error("Error saving FCM token:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
}
