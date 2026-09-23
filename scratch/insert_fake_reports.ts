import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon('postgresql://neondb_owner:npg_ZBwFUEKR82AN@ep-broad-tree-awywjy2s-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require');
  try {
    const uid = 'SN8BwMPRhxbklqpTUGzjh2Q3Hex1';

    // clear existing
    await sql`DELETE FROM daily_reports WHERE firebase_uid = ${uid}`;

    // Insert 2 days ago: 0 USDT
    const date1 = new Date();
    date1.setDate(date1.getDate() - 2);
    await sql`INSERT INTO daily_reports (firebase_uid, report_date, balance, net_pnl) VALUES (${uid}, ${date1.toISOString()}, '0.00', '0.00')`;

    // Insert 1 day ago: 15 USDT
    const date2 = new Date();
    date2.setDate(date2.getDate() - 1);
    await sql`INSERT INTO daily_reports (firebase_uid, report_date, balance, net_pnl) VALUES (${uid}, ${date2.toISOString()}, '15.00', '15.00')`;

    console.log("Inserted fake records successfully.");
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

run();
