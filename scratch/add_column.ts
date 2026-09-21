import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE "signal_history" ADD COLUMN "volume_rank" integer;`;
  console.log("Column added successfully!");
}
run().then(() => process.exit(0));
