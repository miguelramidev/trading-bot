import { db } from "../src/db/index.js";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql`ALTER TABLE user_config ADD COLUMN binance_api_key TEXT;`);
    console.log("Column binance_api_key added.");
  } catch(e) { console.error("Error adding binance_api_key:", e.message); }

  try {
    await db.execute(sql`ALTER TABLE user_config ADD COLUMN binance_api_secret TEXT;`);
    console.log("Column binance_api_secret added.");
  } catch(e) { console.error("Error adding binance_api_secret:", e.message); }
  
  console.log("Migration finished.");
}
run();
