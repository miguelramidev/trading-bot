import { Telegraf } from "telegraf";
import { sendPushNotificationAndPrune } from "../firebase.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory, userConfig } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";
import { Trader } from "../bot/trader.js";
import { Resource } from "sst";
import {
  buildCloseTelegramMessage,
  buildClosePushMessage,
  estimatePnlFromOpeningFill,
  estimatePnlFromConfig,
  type CloseReason,
} from "./closeNotificationHelpers.js";
import { reconcileActiveTrades, isReconciliationDryRun } from "./reconciliation.js";

const telegramToken = process.env.TELEGRAM_TOKEN || (Resource as any).TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

// Los fills de CIERRE a veces todavía no llegaron a fetchMyTrades en el mismo
// tick del cron en que el monitor detecta el cruce de precio — unos pocos
// reintentos cortos alcanzan casi siempre (mismo patrón que
// EXIT_ORDER_RETRY_DELAY_MS en trader.ts, para el mismo tipo de demora de
// Binance). Esto NO cambia cómo se calcula el PnL real: solo le da más
// chances a la misma llamada antes de recurrir a un estimado.
const PNL_FETCH_MAX_ATTEMPTS = 3;
const PNL_FETCH_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAnalysis(timeframe: string) {
  console.log(`[${timeframe}] Cron de monitoreo: órdenes huérfanas, conciliación y posiciones abiertas...`);
  
  const users = await db.query.userConfig.findMany();

  const dataFetcher = new DataFetcher();
  const trader = new Trader();
  
  // Limpieza de huérfanos antes de analizar
  try {
    await trader.cleanOrphanOrders();
  } catch(e: any) {
    console.error("Warning: Failed to clean orphan orders:", e.message);
  }

  // Conciliación con Binance (src/cron/reconciliation.ts). Mientras RECONCILIATION_DRY_RUN no
  // sea exactamente "false" (default), corre en paralelo solo logueando y el monitor de velas de
  // abajo sigue manejando TODO como hasta ahora, sin cambios. Al desactivarla, el monitor deja de
  // tocar las filas "Tomada" (pasan a ser responsabilidad exclusiva de la conciliación) y sigue
  // las "Descartada" por velas igual que siempre, porque esas nunca tuvieron una posición real.
  try {
    await reconcileActiveTrades();
  } catch (e: any) {
    console.error("Warning: Failed to reconcile active trades:", e.message);
  }

  // --- MONITOR DE OPERACIONES ACTIVAS ---
  const activeTrades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.isActiveTrade, true)
  });

  for (const trade of activeTrades) {
    try {
      if (trade.decision === "Tomada" && !isReconciliationDryRun()) {
        // La conciliación ya es la autoridad para esta fila: no la toca el monitor por velas.
        continue;
      }

      const recentCandles = await dataFetcher.fetchOhlcv(trade.symbol, "15m", 2);
      if (!recentCandles || recentCandles.length === 0) continue;
      
      const maxHigh = Math.max(...recentCandles.map(c => c.high));
      const minLow = Math.min(...recentCandles.map(c => c.low));
      const currentPrice = recentCandles[recentCandles.length - 1].close;
      
      // Usar los Kill Switches del Grid si existen, si no, fallback al SL/TP original
      const sl = parseFloat(trade.gridSL || trade.stopLoss!);
      const tp = parseFloat(trade.gridTP || trade.takeProfit!);
      
      let closed = false;
      let closeReason = "";
      
      if (trade.direction === "LONG") {
        if (minLow <= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        else if (maxHigh >= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      } else {
        if (maxHigh >= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        else if (minLow <= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      }
      
      if (closed) {
        const finalDecision = `${trade.decision || ''} -> ${closeReason}`;
        const closeReasonKey: CloseReason = closeReason.includes("TP") ? "tp" : "sl";

        let finalPnl = null;
        let finalRoi = null;
        let entryP = null;
        let exitP = null;

        // Para la notificación: el PnL real si los fills de cierre ya están
        // (tras los reintentos), o un estimado si no — nunca se guarda en la
        // BD (`finalPnl`/`finalRoi` de arriba, que sí se persisten, salen
        // únicamente del cálculo real de siempre, sin tocar).
        let notificationPnl: number | null = null;
        let notificationIsEstimated = false;
        let needsPerUserEstimate = false;

        if (trade.decision === "Tomada") {
          try {
             const sinceMs = trade.evaluatedAt.getTime();
             const direction = trade.direction as "LONG" | "SHORT";

             // Reintento corto: el fill de CIERRE a veces todavía no llegó a
             // fetchMyTrades en el mismo tick que detectó el cruce de precio.
             // `entryPrice !== undefined` (no `net !== 0`) es la señal real de
             // "hay fills" — así un breakeven real no se confunde con "todavía
             // no llegó" (antes de este fix, ambos casos mandaban el mensaje
             // sin ningún monto, en silencio).
             let pnlData = await trader.getTradeRealizedPnl(trade.symbol, sinceMs, direction);
             let attempts = 1;
             while (pnlData.entryPrice === undefined && attempts < PNL_FETCH_MAX_ATTEMPTS) {
                await sleep(PNL_FETCH_RETRY_DELAY_MS);
                pnlData = await trader.getTradeRealizedPnl(trade.symbol, sinceMs, direction);
                attempts++;
             }

             const fillsFound = pnlData.entryPrice !== undefined;
             const net = pnlData.pnl - pnlData.fee;

             if (fillsFound) {
                 finalPnl = net.toFixed(4);
                 // Aproximación de ROI ya conocida como poco confiable desde el
                 // refactor multi-tenant (ver skill auditoria-trades) — se
                 // sigue guardando igual que siempre (no se cambia cómo se
                 // calcula/guarda), pero ya no se muestra en el mensaje.
                 if (trade.accountBalance) {
                     const margin = parseFloat(trade.accountBalance) * 0.20;
                     if (margin > 0) finalRoi = ((net / margin) * 100).toFixed(2);
                 }
                 notificationPnl = net;
                 notificationIsEstimated = false;
             } else if (pnlData.openingFill) {
                 // Sin fills de cierre todavía, pero los de APERTURA sí (lo
                 // normal: la apertura fue hace rato) — estimado con la
                 // cantidad y el precio de entrada reales de esos fills.
                 notificationPnl = estimatePnlFromOpeningFill({
                    direction,
                    openingFill: pnlData.openingFill,
                    exitPrice: currentPrice,
                 });
                 notificationIsEstimated = true;
             } else {
                 // Ni cierre ni apertura disponibles todavía: se estima por
                 // usuario (cada uno con su propio margen/apalancamiento
                 // configurado) en el loop de notificación, más abajo.
                 needsPerUserEstimate = true;
             }

             if (pnlData.entryPrice) entryP = pnlData.entryPrice.toString();
             if (pnlData.exitPrice) exitP = pnlData.exitPrice.toString();
          } catch(e) {
             console.error("Error fetching PnL:", e);
          }
        }

        // Actualizamos la BD con todos los nuevos datos institucionales
        await db.update(signalHistory)
          .set({
             isActiveTrade: false,
             decision: finalDecision,
             realizedPnl: finalPnl,
             realizedRoi: finalRoi,
             executedEntryPrice: entryP,
             executedExitPrice: exitP
          })
          .where(eq(signalHistory.id, trade.id));

        if (trade.decision === "Tomada") {
          for (const user of users) {
            const userPnl = needsPerUserEstimate
              ? estimatePnlFromConfig({
                  direction: trade.direction as "LONG" | "SHORT",
                  entryPrice: parseFloat(trade.entry || "0"),
                  exitPrice: currentPrice,
                  marginUsd: user.montoOperacion ? parseFloat(user.montoOperacion.toString()) : 25,
                  leverage: user.leverageMin ?? 1,
                })
              : notificationPnl;
            const userIsEstimated = needsPerUserEstimate || notificationIsEstimated;

            const notificationInput = {
              symbol: trade.symbol,
              direction: trade.direction as "LONG" | "SHORT",
              closeReason: closeReasonKey,
              pnl: userPnl,
              isEstimated: userIsEstimated,
              entryPrice: entryP ? parseFloat(entryP) : parseFloat(trade.entry || "0") || null,
              exitPrice: exitP ? parseFloat(exitP) : currentPrice,
            };

            if ((user.notificationsMobile || user.notificationsWeb) && user.fcmTokens && user.fcmTokens.length > 0) {
              const { title, body } = buildClosePushMessage(notificationInput);
              for (const t of user.fcmTokens) {
                await sendPushNotificationAndPrune(user.id, t, title, body, { tradeId: String(trade.id), symbol: trade.symbol });
              }
            }
            if (user.chatId && user.notificationsTelegram) {
              try {
                await bot.telegram.sendMessage(user.chatId, buildCloseTelegramMessage(notificationInput), { parse_mode: "HTML" });
              } catch(e:any) { console.error("Telegram error:", e.message); }
            }
          }
        } else if (trade.decision === "Descartada") {
          const hitTP = closeReason.includes("TP");
          let msg = "";
          if (hitTP) {
             msg = `🤦‍♂️ <b>Oportunidad Perdida:</b> Descartaste ${trade.symbol} y acaba de tocar Take Profit (El Grid hubiera ganado).\nÚltimo precio: ${currentPrice}\n\n📝 <i>Motivo de descarte: ${trade.reason || "Ninguno"}</i>`;
          } else {
             msg = `😎 <b>¡Esquivaste una bala!</b> Descartaste ${trade.symbol} y efectivamente terminó tocando el Kill Switch (SL).\nÚltimo precio: ${currentPrice}\n\n📝 <i>Motivo de descarte: ${trade.reason || "Ninguno"}</i>`;
          }
          
          for (const user of users) {
             if (user.chatId && user.notificationsTelegram) { try { await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" }); } catch(e:any) { console.error("Telegram error:", e.message); } }
          }
        }
      }
    } catch (e) {
      console.error(`Error monitoreando ${trade.symbol}:`, e);
    }
  }

  // La generación de señales de las estrategias de 15m (Detección Técnica Base y Cazador de
  // Ruptura Macro) se retiró el 2026-10-07: perdían en backtest y en operación real (PF 0,77, ver
  // docs/auditorias/2026-10-06-pnl-real.md). Este cron queda solo para limpiar órdenes huérfanas,
  // conciliar con Binance y monitorear las posiciones que sigan abiertas hasta que cierren. Las
  // estrategias candidatas se siguen en modo sombra (src/shadow/).
}

export async function handler15m() { await runAnalysis("15m"); }

