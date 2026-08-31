import { pgTable, text, boolean, timestamp, serial } from "drizzle-orm/pg-core";

// Guardamos la configuración de cada chat
export const userConfig = pgTable("user_config", {
  chatId: text("chat_id").primaryKey(),
  isPaused: boolean("is_paused").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Guardamos el historial de señales para no repetir monedas recientes
export const signalHistory = pgTable("signal_history", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
  direction: text("direction"), // "LONG" | "SHORT"
  entry: text("entry"), // guardamos como texto para no perder precisión decimal
  stopLoss: text("stopLoss"),
  takeProfit: text("takeProfit"),
  minNotional: text("minNotional"),
});
