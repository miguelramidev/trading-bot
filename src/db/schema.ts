import { pgTable, text, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";

// Guardamos la configuración de cada chat
export const userConfig = pgTable("user_config", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").unique(), // Telegram ID
  firebaseUid: text("firebase_uid").unique(), // Web/App Auth ID
  email: text("email").unique(),
  name: text("name"),
  binanceApiKey: text("binance_api_key"),
  binanceApiSecret: text("binance_api_secret"),
  montoOperacion: integer("monto_operacion").default(25),
  apalancamiento: integer("apalancamiento").default(10),
  maxTrades: integer("max_trades").default(5),
  rsaPublicKey: text("rsa_public_key"),
  rsaPrivateKey: text("rsa_private_key"),
  isPaused: boolean("is_paused").default(false).notNull(),
  leverage: integer("leverage").default(1).notNull(),
  pendingSignalId: integer("pending_signal_id").references(() => signalHistory.id),
  startingBalance: text("starting_balance").default("41.78"),
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
  volumeRank: integer("volume_rank"),
  btcRegime: text("btc_regime"),
  decision: text("decision"), // "Tomada", "Descartada", null (pendiente)
  reason: text("reason"), // Por qué se tomó/descartó
  // --- Nuevos campos exclusivos para Grid Trading ---
  accountBalance: text("account_balance"), // Saldo de Binance al emitir señal
  numGrids: integer("num_grids"), // Cantidad de grillas calculadas
  gridStep: text("grid_step"), // Separación % (ej: 0.005)
  gridSL: text("grid_sl"), // Kill Switch Inferior
  gridTP: text("grid_tp"), // Kill Switch Superior
  realizedPnl: text("realized_pnl"), // PnL Neto en USDT al cerrar
  realizedRoi: text("realized_roi"), // ROI Neto en % al cerrar
  executedEntryPrice: text("executed_entry_price"), // Precio real al que entró en Binance
  executedExitPrice: text("executed_exit_price"), // Precio real al que salió en Binance
  // --- Nuevos campos para Monitoreo de Indicadores ---
  triggerVolume: text("trigger_volume"), // Volumen de la vela gatillo
  triggerAvgVolume: text("trigger_avg_volume"), // Volumen promedio (SMA 20)
  triggerRsi: text("trigger_rsi"), // RSI 14
  triggerEma21: text("trigger_ema21"), // EMA 21
  triggerAdx: text("trigger_adx"), // ADX 14
  triggerLowerBb: text("trigger_lower_bb"), // Banda Bollinger Inferior
  triggerUpperBb: text("trigger_upper_bb"), // Banda Bollinger Superior
});

// Tabla para snapshots diarios del rendimiento de la cuenta
export const dailyReports = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull(),
  reportDate: timestamp("report_date").defaultNow().notNull(),
  balance: text("balance").notNull(), // Saldo real en Binance a las 23:00
  netPnl: text("net_pnl"), // Diferencia vs el balance del día anterior
  tradesTaken: integer("trades_taken").default(0), // Operaciones tomadas ese día
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
});
