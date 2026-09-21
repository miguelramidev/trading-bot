import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  await db.update(signalHistory)
    .set({ decision: "Tomada -> Cerrada (TP Tocado)", reason: "Cerrada por el usuario" })
    .where(eq(signalHistory.id, 122));
  console.log("DB Updated!");
}
run().then(() => process.exit(0));
