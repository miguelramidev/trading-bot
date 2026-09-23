import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon('postgresql://neondb_owner:npg_ZBwFUEKR82AN@ep-broad-tree-awywjy2s-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require');
  const users = await sql`SELECT * FROM user_config`;
  console.log(users);
}
run();
