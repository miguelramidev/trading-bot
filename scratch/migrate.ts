import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon('postgresql://neondb_owner:npg_ZBwFUEKR82AN@ep-broad-tree-awywjy2s-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require');
  try {
    await sql`ALTER TABLE daily_reports ADD COLUMN firebase_uid TEXT NOT NULL DEFAULT 'SYSTEM'`;
    console.log("Column added successfully.");
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

run();
