import { db } from "./db";
import { userConfig } from "./db/schema";
import { Trader } from "./bot/trader";
import { decrypt } from "./api/modules/users/infrastructure/encryption";

async function checkBalance() {
  const users = await db.select().from(userConfig);
  console.log(`Found ${users.length} users in DB.`);
  for (const user of users) {
    if (!user.binanceApiKey) continue;
    console.log(`Checking user: ${user.chatId || user.firebaseUid}`);
    let userKey = "";
    let userSecret = "";
    try {
      userKey = decrypt(user.binanceApiKey);
      if (user.rsaPrivateKey) {
        userSecret = decrypt(user.rsaPrivateKey);
      } else if (user.binanceApiSecret) {
        userSecret = decrypt(user.binanceApiSecret);
      }
    } catch(e) {
      console.log("Error decrypting keys for user");
      continue;
    }
    
    if (userKey) {
      const trader = new Trader(userKey, userSecret);
      const balance = await trader.getFreeBalance();
      console.log(`- Configured Margin: ${user.montoOperacion}`);
      console.log(`- Real Futures USDT Balance: ${balance}`);
    }
  }
}

checkBalance().catch(console.error).finally(() => process.exit(0));
