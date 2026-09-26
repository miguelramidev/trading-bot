import { db } from "./src/db";
import { userConfig } from "./src/db/schema";
import { Trader } from "./src/bot/trader";
import { decrypt } from "./src/api/modules/users/infrastructure/encryption";

async function run() {
  const users = await db.select().from(userConfig);
  for (const user of users) {
    if (user.id !== 2) continue; // Only check user 2
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
    
    console.log(`Key length: ${userKey.length}`);
    const trader = new Trader(userKey, userSecret);
    try {
      const bal = await trader.getFreeBalance();
      console.log(`Trader.getFreeBalance() returned: ${bal}`);
    } catch(e) {
      console.log(`Error: ${e}`);
    }
  }
}
run().then(() => process.exit(0));
