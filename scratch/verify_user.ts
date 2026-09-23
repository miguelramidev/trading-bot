import { db } from "../src/db/index.js";
import { userConfig } from "../src/db/schema.js";
import { isNotNull } from "drizzle-orm";

async function run() {
  const users = await db.select().from(userConfig).where(isNotNull(userConfig.firebaseUid));
  console.log(JSON.stringify(users, null, 2));
}
run();
