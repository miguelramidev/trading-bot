import { pgTable, text, boolean, timestamp, serial, integer, bigint, unique, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { SignalWarning } from "../cron/signalWarnings.js";

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
  apalancamiento: integer("apalancamiento").default(10), // ✅ CAMPO CANÓNICO — configurado desde la app Flutter y Telegram /leverage
  leverageMin: integer("leverage_min").default(1),      // Mínimo con el que siempre se opera (RULES.md Regla 1)
  leverageMax: integer("leverage_max").default(2),      // Máximo al que puede escalar si minNotional no se alcanza (RULES.md Regla 1)
  maxTrades: integer("max_trades").default(5),
  rsaPublicKey: text("rsa_public_key"),
  rsaPrivateKey: text("rsa_private_key"),
  isPaused: boolean("is_paused").default(false).notNull(),
  leverage: integer("leverage").default(1).notNull(),
  pendingSignalId: integer("pending_signal_id").references(() => signalHistory.id),
  fcmTokens: text("fcm_tokens").array().default([]), // Tokens para Notificaciones Push (Web + Android)
  notificationsWeb: boolean("notifications_web").default(true).notNull(),
  notificationsMobile: boolean("notifications_mobile").default(true).notNull(),
  notificationsTelegram: boolean("notifications_telegram").default(true).notNull(),
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
  decision: text("decision"), // "Tomada", "Descartada" (manual), "Rechazada" (executeTrade), "Ignorada" (expiró), "Ejecutando" (reserva atómica en curso), null (pendiente)
  reason: text("reason"), // Por qué se tomó/descartó
  // Reserva atómica antes de ejecutar (ROADMAP.md A1, reserveSignalForExecution en
  // tradeExecution.ts): quién la pidió y cuándo, para que la conciliación pueda resolver una
  // fila que quedó trabada en "Ejecutando" (ej. la Lambda se cortó a mitad de camino) sabiendo
  // contra qué cuenta de Binance confirmar si la posición se llegó a abrir.
  reservedByUserId: integer("reserved_by_user_id").references((): AnyPgColumn => userConfig.id),
  reservedAt: timestamp("reserved_at"),
  // Aditivo (Fase 1, 2026-10-01): las advertencias de riesgo macro/reversa de
  // estrategia que antes solo vivían mezcladas dentro de `reason` (y que se
  // perdían al ejecutar/descartar, porque ese mismo campo se pisa con el
  // resultado de la ejecución, truncado a 100 caracteres — ver
  // `recordExecutionResult` en `cron/tradeExecution.ts`). `null` en señales
  // viejas: la app cae a parsear `reason` por viñetas en ese caso (ver
  // `app/lib/core/utils/signal_warnings.dart`).
  warnings: jsonb("warnings").$type<SignalWarning[]>(),
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

// Updates de Telegram ya recibidos: deduplica las reentregas del webhook por update_id
export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

// Una fila por señal ejecutada y por usuario (incremental hacia la tabla propuesta en
// ROADMAP.md: "Tabla trade_executions"). `signal_history` sigue siendo la fuente para la
// app/Telegram (decision/isActiveTrade/reason no cambian); esta tabla es la que usa la
// conciliación del cron para saber contra qué cuenta de Binance y qué fila verificar.
export const tradeExecutions = pgTable("trade_executions", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id").notNull().references(() => signalHistory.id),
  userId: integer("user_id").notNull().references(() => userConfig.id),
  source: text("source"), // 'telegram' | 'api' | null si no se puede determinar (ej. backfill)
  leverage: integer("leverage"),
  marginUsd: text("margin_usd"), // texto, igual que el resto de precios/PnL (ver schema arriba)
  quantity: text("quantity"),
  entryPrice: text("entry_price"),
  exitPrice: text("exit_price"),
  openedAt: timestamp("opened_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  closedAt: timestamp("closed_at"),
  closeReason: text("close_reason"), // 'tp' | 'sl' | 'manual' | 'emergency'
  realizedPnl: text("realized_pnl"),
  fee: text("fee"),
  lastMissingSlAlertAt: timestamp("last_missing_sl_alert_at"), // throttle de la alerta de "sin SL"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.signalId, table.userId),
]);

// Throttle (mismo patrón que trade_executions.last_missing_sl_alert_at) para la alerta de
// "posición huérfana": una posición real en Binance sin ninguna fila activa en trade_executions
// para ese usuario y símbolo — el bot no la está siguiendo. No hay una fila de trade_executions
// a la que colgarle el throttle (por definición, no hay ninguna activa), así que necesita su
// propia tabla.
export const orphanPositionAlerts = pgTable("orphan_position_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => userConfig.id),
  symbol: text("symbol").notNull(),
  lastAlertAt: timestamp("last_alert_at").notNull(),
}, (table) => [
  unique().on(table.userId, table.symbol),
]);
