import { db } from "./src/db";
import { userConfig } from "./src/db/schema";
import { Trader } from "./src/bot/trader";
import { decrypt } from "./src/api/modules/users/infrastructure/encryption";

async function run() {
  const users = await db.select().from(userConfig);
  for (const user of users) {
    if (!user.binanceApiKey) continue;
    let userKey = decrypt(user.binanceApiKey);
    let userSecret = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : decrypt(user.binanceApiSecret!);
    
    console.log(`Checking user ${user.id}...`);
    try {
      const trader = new Trader(userKey, userSecret);
      const balance = await trader.getFreeBalance();
      console.log(`Balance for user ${user.id}: ${balance} (Required: ${user.montoOperacion})`);
    } catch (e) {
      console.log(`Error for user ${user.id}: ${e}`);
    }
  }
}

run().then(() => process.exit(0));
