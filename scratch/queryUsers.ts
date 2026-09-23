import { db } from "../src/db/index.js";
import { userConfig } from "../src/db/schema.js";

async function run() {
  const users = await db.select().from(userConfig);
  console.log(JSON.stringify(users, null, 2));
}
run();
