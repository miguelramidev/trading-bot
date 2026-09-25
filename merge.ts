import { db } from './src/db/index.js';
import { userConfig } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const tgmUser = await db.query.userConfig.findFirst({ where: eq(userConfig.chatId, '769581187') });
    const fbUser = await db.query.userConfig.findFirst({ where: eq(userConfig.firebaseUid, 'SN8BwMPRhxbklqpTUGzjh2Q3Hex1') });

    if (tgmUser && fbUser && tgmUser.id !== fbUser.id) {
      console.log('Merging user id', tgmUser.id, 'into', fbUser.id);
      await db.delete(userConfig).where(eq(userConfig.id, tgmUser.id));
      await db.update(userConfig).set({ chatId: '769581187' }).where(eq(userConfig.id, fbUser.id));
      console.log('Merge successful!');
    } else {
      console.log('Users not found or already merged.');
    }
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}

main();
