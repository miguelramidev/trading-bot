import { handler15m } from "../src/cron/analyze.js";

async function run() {
  console.log("Iniciando test de cron...");
  await handler15m();
  console.log("Test de cron finalizado.");
}

run().then(() => process.exit(0)).catch(e => {
  console.error("Crash fatal:", e);
  process.exit(1);
});
