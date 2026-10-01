// Conciliación con Binance: para cada operación ejecutada y activa (trade_executions.isActive),
// consulta las posiciones y órdenes REALES del usuario (una sola llamada por usuario y por
// ciclo, no por operación) y decide qué pasó con `decideReconciliationAction`
// (src/cron/reconciliationDecision.ts, función pura). Esta orquestación es la única que hace
// las llamadas de red/DB y aplica la decisión — o solo la loguea si RECONCILIATION_DRY_RUN
// está activo (default: activo).
import { and, eq } from "drizzle-orm";
import { Telegram } from "telegraf";
import { Resource } from "sst";
import { db } from "../db/index.js";
import { tradeExecutions, signalHistory, userConfig } from "../db/schema.js";
import { decrypt } from "../api/core/utils/encryption.js";
import { Trader } from "../bot/trader.js";
import { sendCriticalAlert } from "../bot/criticalAlert.js";
import { sendPushNotification } from "../firebase.js";
import { decideReconciliationAction, type ReconciliationAction } from "./reconciliationDecision.js";
import { buildCloseTelegramMessage, buildClosePushMessage, closeReasonLabel } from "./closeNotificationHelpers.js";

type TradeExecutionRow = typeof tradeExecutions.$inferSelect;
type UserRow = typeof userConfig.$inferSelect;

// Mismo patrón que PNL_FETCH_MAX_ATTEMPTS/PNL_FETCH_RETRY_DELAY_MS en analyze.ts y
// CLOSING_FILL_MAX_ATTEMPTS en tradeExecution.ts: los fills de un cierre recién detectado a
// veces tardan unos segundos en aparecer en fetchMyTrades.
const CLOSING_FILL_MAX_ATTEMPTS = 3;
const CLOSING_FILL_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTelegramToken(): string | undefined {
  return process.env.TELEGRAM_TOKEN || (Resource as any).TELEGRAM_TOKEN?.value;
}

/** Arranca activado (solo logueo): hay que setear `RECONCILIATION_DRY_RUN=false` explícitamente
 * para que la conciliación empiece a escribir en la base y a notificar de verdad. */
export function isReconciliationDryRun(): boolean {
  const raw = process.env.RECONCILIATION_DRY_RUN || (Resource as any).RECONCILIATION_DRY_RUN?.value;
  return raw !== "false";
}

export async function reconcileActiveTrades(): Promise<void> {
  const dryRun = isReconciliationDryRun();
  const activeTrades = await db.query.tradeExecutions.findMany({ where: eq(tradeExecutions.isActive, true) });
  if (activeTrades.length === 0) return;

  const byUser = new Map<number, TradeExecutionRow[]>();
  for (const trade of activeTrades) {
    if (!byUser.has(trade.userId)) byUser.set(trade.userId, []);
    byUser.get(trade.userId)!.push(trade);
  }

  for (const [userId, trades] of byUser) {
    try {
      await reconcileUserTrades(userId, trades, dryRun);
    } catch (e) {
      console.error(`[conciliación] Error procesando al usuario ${userId}:`, e);
    }
  }
}

async function reconcileUserTrades(userId: number, trades: TradeExecutionRow[], dryRun: boolean): Promise<void> {
  const user = await db.query.userConfig.findFirst({ where: eq(userConfig.id, userId) });
  if (!user || !user.binanceApiKey) {
    console.error(`[conciliación] Usuario ${userId} sin API keys configuradas, se omite.`);
    return;
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(user.binanceApiKey);
    apiSecret = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : decrypt(user.binanceApiSecret!);
  } catch (e) {
    console.error(`[conciliación] Error desencriptando las llaves del usuario ${userId}:`, e);
    return;
  }

  const trader = new Trader(apiKey, apiSecret);
  // Una sola llamada para TODAS las operaciones activas de este usuario, no una por operación.
  const [positions, openOrders] = await Promise.all([trader.fetchAllPositions(), trader.fetchAllOpenOrders()]);

  for (const trade of trades) {
    try {
      await reconcileOneTrade(trade, user, trader, positions, openOrders, dryRun);
    } catch (e) {
      console.error(`[conciliación] Error conciliando trade_executions.id=${trade.id}:`, e);
    }
  }
}

async function reconcileOneTrade(
  trade: TradeExecutionRow,
  user: UserRow,
  trader: Trader,
  positions: any[],
  openOrders: any[],
  dryRun: boolean
): Promise<void> {
  const signal = await db.query.signalHistory.findFirst({ where: eq(signalHistory.id, trade.signalId) });
  if (!signal || !signal.direction) {
    console.error(`[conciliación] trade_executions.id=${trade.id} sin señal o sin dirección asociada, se omite.`);
    return;
  }

  const symbol = signal.symbol;
  const direction = signal.direction as "LONG" | "SHORT";
  const gridSL = parseFloat(signal.gridSL || signal.stopLoss || "0");
  const gridTP = parseFloat(signal.gridTP || signal.takeProfit || "0");

  const position = positions.find((p: any) => p.symbol === symbol && p.contracts && p.contracts > 0);
  const positionOpen = !!position;
  const symbolOrders = openOrders.filter((o: any) => o.symbol === symbol);

  // Para una posición abierta, el precio real de Binance es más fiel que lo que guardamos
  // nosotros (sin slippage); para una ya cerrada, usamos el que tengamos (trade_executions o,
  // de respaldo, el de la señal).
  const entryPrice = positionOpen
    ? (position.entryPrice ?? parseFloat(trade.entryPrice || signal.entry || "0"))
    : parseFloat(trade.entryPrice || signal.entry || "0");

  let closingFill: Awaited<ReturnType<Trader["getClosingFill"]>> | undefined;
  let closingClientOrderId: string | undefined;
  if (!positionOpen) {
    const exitSide = direction === "LONG" ? "sell" : "buy";
    // En modo de solo registro no reintentamos: si el fill todavía no llegó, se va a volver a
    // ver en el próximo ciclo (15m después) de cualquier forma, así que no vale la pena sumar
    // reintentos (ni los ~3s de espera) a un ciclo que total no va a escribir ni notificar nada.
    const maxAttempts = dryRun ? 1 : CLOSING_FILL_MAX_ATTEMPTS;
    closingFill = await fetchClosingFillWithRetries(trader, symbol, trade.openedAt.getTime(), exitSide, maxAttempts);
    if (closingFill.fillsFound) {
      closingClientOrderId = await trader.getOrderClientId(symbol, closingFill.orderId);
    }
  }

  const tickSize = await trader.getTickSize(symbol);

  const action = decideReconciliationAction({
    direction,
    entryPrice,
    gridSL,
    gridTP,
    positionOpen,
    protectionOrders: symbolOrders,
    tickSize,
    closingFill,
    closingClientOrderId,
    now: new Date(),
    lastMissingSlAlertAt: trade.lastMissingSlAlertAt,
  });

  if (dryRun) {
    console.log(`[conciliación][solo registro] trade_executions.id=${trade.id} (${symbol}):`, JSON.stringify(action));
    return;
  }

  await applyAction(action, trade, signal.isActiveTrade, user, trader, symbol, direction, entryPrice);
}

async function fetchClosingFillWithRetries(
  trader: Trader,
  symbol: string,
  sinceMs: number,
  exitSide: "buy" | "sell",
  maxAttempts: number
): ReturnType<Trader["getClosingFill"]> {
  let fill = await trader.getClosingFill(symbol, sinceMs, exitSide);
  let attempts = 1;
  while (!fill.fillsFound && attempts < maxAttempts) {
    await sleep(CLOSING_FILL_RETRY_DELAY_MS);
    fill = await trader.getClosingFill(symbol, sinceMs, exitSide);
    attempts++;
  }
  return fill;
}

async function applyAction(
  action: ReconciliationAction,
  trade: TradeExecutionRow,
  signalWasActiveTrade: boolean,
  user: UserRow,
  trader: Trader,
  symbol: string,
  direction: "LONG" | "SHORT",
  entryPrice: number
): Promise<void> {
  if (action.kind === "still_open") return;

  if (action.kind === "missing_stop_loss") {
    if (!action.shouldAlert) return;
    await db.update(tradeExecutions).set({ lastMissingSlAlertAt: new Date() }).where(eq(tradeExecutions.id, trade.id));
    await sendCriticalAlert(
      user.chatId,
      user.fcmTokens,
      `🚨 <b>SIN STOP LOSS:</b> la posición de ${symbol} no tiene ninguna orden de Stop Loss activa en Binance. Colocalo manualmente ahora.`
    );
    return;
  }

  if (action.kind === "stop_mismatch") {
    if (user.chatId && user.notificationsTelegram) {
      const token = getTelegramToken();
      if (token) {
        try {
          await new Telegram(token).sendMessage(
            user.chatId,
            `⚠️ El Stop Loss real de ${symbol} en Binance (${action.actualPrice}) no coincide con el de la señal (${action.expectedPrice}).`
          );
        } catch (e: any) {
          console.error("[conciliación] Error enviando el aviso de SL distinto:", e.message);
        }
      }
    }
    return;
  }

  // action.kind === "closed"
  console.log(
    `[conciliación] trade_executions.id=${trade.id} (${symbol}): cerró por "${action.reason}", identificado por ${action.identifiedBy}.`
  );

  // Update condicional (isActive=true en el WHERE): si otro ciclo ya cerró esta fila entre que
  // la leímos y acá, `updated` queda vacío y no duplicamos el cierre ni la notificación.
  const updated = await db
    .update(tradeExecutions)
    .set({
      isActive: false,
      closedAt: new Date(),
      closeReason: action.reason,
      realizedPnl: action.pnl !== null ? action.pnl.toFixed(4) : null,
      exitPrice: action.exitPrice !== null ? action.exitPrice.toString() : null,
      quantity: action.quantity !== null ? action.quantity.toString() : trade.quantity,
    })
    .where(and(eq(tradeExecutions.id, trade.id), eq(tradeExecutions.isActive, true)))
    .returning({ id: tradeExecutions.id });

  if (updated.length === 0) return;

  // Respaldo: normalmente Binance ya auto-expira la orden de protección contraria cuando una de
  // las dos cierra toda la posición, pero no en un cierre manual desde la app. Esto corre pase lo
  // que pase con signal_history: es higiene de Binance, no depende de qué tabla haya quedado al día.
  await trader.cancelLeftoverOrders(symbol).catch((e: any) => console.error("[conciliación] Error cancelando huérfanas tras el cierre:", e.message));

  // Transición mientras el modo de solo registro estuvo activo: el monitor por velas pudo haber
  // cerrado esta misma fila de signal_history en un ciclo anterior (corrían en paralelo). Si ya
  // está cerrada, no la tocamos de nuevo ni mandamos una segunda notificación — trade_executions
  // ya quedó al día arriba, que es lo único que le faltaba.
  if (!signalWasActiveTrade) {
    console.log(`[conciliación] trade_executions.id=${trade.id} (${symbol}): signal_history ya estaba cerrada (monitor de velas) — no se notifica de nuevo.`);
    return;
  }

  await db
    .update(signalHistory)
    .set({
      isActiveTrade: false,
      decision: `Tomada -> Cerrada (${closeReasonLabel(action.reason)})`,
      realizedPnl: action.pnl !== null ? action.pnl.toFixed(4) : null,
      executedExitPrice: action.exitPrice !== null ? action.exitPrice.toString() : null,
    })
    .where(eq(signalHistory.id, trade.signalId));

  const notificationInput = {
    symbol,
    direction,
    closeReason: action.reason,
    pnl: action.pnl,
    isEstimated: false,
    entryPrice,
    exitPrice: action.exitPrice,
  };

  if ((user.notificationsMobile || user.notificationsWeb) && user.fcmTokens && user.fcmTokens.length > 0) {
    const { title, body } = buildClosePushMessage(notificationInput);
    for (const t of user.fcmTokens) {
      await sendPushNotification(t, title, body, { tradeId: String(trade.signalId), symbol });
    }
  }
  if (user.chatId && user.notificationsTelegram) {
    const token = getTelegramToken();
    if (token) {
      try {
        await new Telegram(token).sendMessage(user.chatId, buildCloseTelegramMessage(notificationInput), { parse_mode: "HTML" });
      } catch (e: any) {
        console.error("[conciliación] Error enviando la notificación de cierre:", e.message);
      }
    }
  }
}
