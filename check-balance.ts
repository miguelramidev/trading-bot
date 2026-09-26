import { db } from "./src/db";
import { userConfig } from "./src/db/schema";
import { Trader } from "./src/bot/trader";
import { decrypt } from "./src/api/modules/users/infrastructure/encryption";

async function run() {
  const users = await db.select().from(userConfig);
  for (const user of users) {
    console.log(`User: ${user.chatId || user.firebaseUid}`);
    let userKey = "";
    let userSecret = "";
    try {
      if (user.binanceApiKey) userKey = decrypt(user.binanceApiKey);
      if (user.rsaPrivateKey) {
        userSecret = decrypt(user.rsaPrivateKey);
      } else if (user.binanceApiSecret) {
        userSecret = decrypt(user.binanceApiSecret);
      }
    } catch(e) {}
    
    if (userKey) {
      const trader = new Trader(userKey, userSecret);
      const balance = await trader.getFreeBalance();
      console.log(`- Configured Margin: ${user.montoOperacion}`);
      console.log(`- Real Balance: ${balance}`);
    } else {
      console.log(`- No API Keys configured`);
    }
  }
}
run().catch(console.error).finally(() => process.exit(0));
