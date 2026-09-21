import { handler15m } from "../src/cron/analyze.js";

async function run() {
  console.log("Activando Cron Manualmente...");
  await handler15m();
  console.log("Cron finalizado.");
}

run().then(() => process.exit(0));
