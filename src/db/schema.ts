import { pgTable, text, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";

// Guardamos la configuración de cada chat
export const userConfig = pgTable("user_config", {
  chatId: text("chat_id").primaryKey(),
  isPaused: boolean("is_paused").default(false).notNull(),
  pendingSignalId: integer("pending_signal_id").references(() => signalHistory.id), // guardamos qué señal quiere operar
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
  breakevenTarget: text("breakevenTarget"),
  minNotional: text("minNotional"),
  isActiveTrade: boolean("is_active_trade").default(false).notNull(),
  breakevenMoved: boolean("breakeven_moved").default(false).notNull(),
});
