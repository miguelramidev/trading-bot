import { db } from "./src/db";
import { userConfig } from "./src/db/schema";

async function run() {
  const users = await db.select().from(userConfig);
  for (const user of users) {
    console.log(`User ID: ${user.id}`);
    console.log(`- isPaused: ${user.isPaused}`);
    console.log(`- Telegram: ${user.notificationsTelegram}`);
    console.log(`- Web: ${user.notificationsWeb}`);
    console.log(`- Mobile: ${user.notificationsMobile}`);
    console.log(`- fcmTokens count: ${user.fcmTokens ? user.fcmTokens.length : 0}`);
  }
}
run().then(() => process.exit(0));
