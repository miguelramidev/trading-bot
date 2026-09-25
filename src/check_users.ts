import { db } from './db/index.js';
import { userConfig } from './db/schema.js';
async function main() {
  const users = await db.query.userConfig.findMany();
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}
main();
