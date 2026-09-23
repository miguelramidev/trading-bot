import { db } from "../src/db/index.js";
import { userConfig } from "../src/db/schema.js";

async function verify() {
  const users = await db.select().from(userConfig);
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}
verify();
