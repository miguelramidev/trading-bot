import { pgTable, text, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";

// Guardamos la configuración de cada chat
export const userConfig = pgTable("user_config", {
  chatId: text("chat_id").primaryKey(),
  isPaused: boolean("is_paused").default(false).notNull(),
  leverage: integer("leverage").default(1).notNull(),
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
  // Nuevos campos para Paper Trading / Log Institucional
  regime: text("regime"), // ej: "Tendencial", "Rango"
  bias4h: text("bias4h"), // "UP", "DOWN"
  strategy: text("strategy"), // "1", "2"
  atr: text("atr"),
  volumeFilter: text("volume_filter"),
  fundingRate: text("funding_rate"),
  openInterest: text("open_interest"),
  btcCorrelation: text("btc_correlation"),
  decision: text("decision"), // "Tomada", "Descartada", null (pendiente)
  reason: text("reason"), // Por qué se tomó/descartó
});
