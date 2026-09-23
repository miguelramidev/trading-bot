import { handler15m } from "../src/cron/analyze.js";

async function run() {
  console.log("Iniciando ejecución de prueba local...");
  try {
    await handler15m();
  } catch (e) {
    console.error("CRASH FATAL:", e);
  }
  console.log("Ejecución finalizada.");
}

run();
