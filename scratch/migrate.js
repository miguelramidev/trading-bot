const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_ZBwFUEKR82AN@ep-broad-tree-awywjy2s-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  try {
    await client.query("ALTER TABLE daily_reports ADD COLUMN firebase_uid TEXT NOT NULL DEFAULT 'SYSTEM'");
    console.log("Column added successfully.");
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}

run();
