// Lambda del modo sombra (cron Shadow4h en sst.config.ts). Solo datos públicos de Binance y la
// tabla shadow_signals: no opera ni notifica.
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { shadowSignals } from "../db/schema.js";
import { BinancePublic } from "./binancePublic.js";
import { runShadow, type ShadowRow, type ShadowStore } from "./runner.js";

const store: ShadowStore = {
  async listOpen(strategy) {
    const rows = await db.select().from(shadowSignals).where(and(eq(shadowSignals.strategy, strategy), eq(shadowSignals.status, "abierta")));
    return rows as ShadowRow[];
  },
  async insert(rows) {
    if (rows.length) await db.insert(shadowSignals).values(rows).onConflictDoNothing();
  },
  async close(id, fields) {
    await db.update(shadowSignals).set(fields).where(eq(shadowSignals.id, id));
  },
};

export async function handler() {
  const summary = await runShadow(new BinancePublic(), store, Date.now());
  console.log("Modo sombra:", JSON.stringify(summary));
}
