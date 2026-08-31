import { Telegraf } from "telegraf";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";
import { PullbackStrategy, Signal } from "../bot/strategy.js";
import { MomentumStrategy } from "../bot/momentum.js";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

async function runAnalysis(timeframe: string) {
  console.log(`[${timeframe}] Iniciando análisis cron...`);
  
  // 1. Check if there is any active user to send messages to
  const users = await db.query.userConfig.findMany();
  const activeUsers = users.filter((u) => !u.isPaused);
  
  if (activeUsers.length === 0) {
    console.log("No hay usuarios activos. Abortando análisis.");
    return;
  }

  // 2. Fetch history to exclude recent coins
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentHistory = await db.query.signalHistory.findMany({
    where: (history, { gte }) => gte(history.evaluatedAt, twentyFourHoursAgo),
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 5,
  });
  const ignoredSymbols = recentHistory.map(h => h.symbol);

  // 3. Run strategy
  const fetcher = new DataFetcher();
  const strategy = new PullbackStrategy();
  
  let topPairs = await fetcher.getTop100Pairs();
  
  // Filtrar las monedas que están en la base de datos como recientes
  if (ignoredSymbols.length > 0) {
    console.log(`Ignorando monedas recientes: ${ignoredSymbols.join(", ")}`);
    topPairs = topPairs.filter(symbol => !ignoredSymbols.includes(symbol));
  }

  if (topPairs.length === 0) return;

  const pullbackSignal = await strategy.runCompetition(fetcher, topPairs, timeframe);
  const momentumStrategy = new MomentumStrategy();
  const momentumSignal = await momentumStrategy.runCompetition(fetcher, topPairs, timeframe);

  let bestSignal: Signal | null = null;

  if (pullbackSignal && momentumSignal) {
    if (momentumSignal.score > pullbackSignal.score) {
      bestSignal = momentumSignal;
    } else {
      bestSignal = pullbackSignal;
    }
  } else {
    bestSignal = pullbackSignal || momentumSignal;
  }

  if (bestSignal) {
    console.log(`Ganadora encontrada: ${bestSignal.symbol}`);
    await sendSignalToUsers(timeframe, bestSignal, activeUsers.map(u => u.chatId));
    
    // Guardar en el historial
    await db.insert(signalHistory).values({
      symbol: bestSignal.symbol,
      timeframe: timeframe,
    });

    // Limpieza de base de datos: Mantener solo un máximo de 5 registros por temporalidad
    const keepRecords = await db.query.signalHistory.findMany({
      where: (history, { eq }) => eq(history.timeframe, timeframe),
      orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
      limit: 5,
    });

    if (keepRecords.length > 0) {
      const idsToKeep = keepRecords.map(r => r.id);
      // Drizzle delete with direct SQL string logic or using inArray since notInArray is needed
      // To avoid massive imports, we can use the simplest approach: select all to delete
      const allRecords = await db.query.signalHistory.findMany({
        where: (history, { eq }) => eq(history.timeframe, timeframe),
      });
      
      for (const record of allRecords) {
        if (!idsToKeep.includes(record.id)) {
          // Delete manually by id if not in the top 5
          await db.delete(signalHistory).where(eq(signalHistory.id, record.id));
        }
      }
    }
  } else {
    console.log(`No se encontraron setups para ${timeframe}`);
  }
}

async function sendSignalToUsers(timeframe: string, signal: Signal, chatIds: string[]) {
  const strategy = new PullbackStrategy();
  const htf = strategy.getHigherTimeframe(timeframe);

  const isLong = signal.direction === "LONG";
  const emoji = isLong ? "🟢" : "🔴";
  const filterMsg = isLong ? "Tendencia Alcista (Sobre EMA 200)" : "Tendencia Bajista (Bajo EMA 200)";
  
  let strategyMsg = signal.strategyName;
  if (strategyMsg === "Pullback Institucional") {
    strategyMsg = isLong ? "Soporte Institucional Múltiple" : "Resistencia Institucional Múltiple";
  }

  const message = `🔔 <b>SEÑAL FUTUROS 1x (${timeframe})</b> 🔔\n\n` +
    `🪙 <b>Par:</b> ${signal.symbol}\n` +
    `🧭 <b>Dirección:</b> ${emoji} <b>${signal.direction}</b>\n` +
    `📈 <b>Filtro:</b> ${filterMsg}\n` +
    `📊 <b>Estrategia:</b> ${strategyMsg} (Zona de ${htf})\n` +
    `💵 <b>Precio Actual:</b> ${signal.currentPrice.toFixed(4)} (${signal.distancePct.toFixed(2)}% hasta entrada)\n` +
    `💰 <b>Min Notional (Binance):</b> ~$${Math.ceil(signal.minNotional)} USDT\n\n` +
    `📝 <b>PLAN DE TRADING (Ratio 1:3)</b>\n` +
    `🛒 <b>Orden Limit:</b> ${signal.entry.toFixed(4)}\n` +
    `🛑 <b>Stop Loss:</b> ${signal.stopLoss.toFixed(4)}\n` +
    `🎯 <b>Take Profit:</b> ${signal.takeProfit.toFixed(4)}\n\n` +
    `🛡️ <b>Gestión Activa:</b> Mueve tu Stop Loss a precio de Entrada (Breakeven) cuando el precio alcance <b>${signal.breakevenTarget.toFixed(4)}</b>\n\n` +
    `<i>💡 Recuerda verificar la gráfica antes de colocar la orden.</i>`;

  for (const chatId of chatIds) {
    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
      console.error(`Error sending message to ${chatId}:`, error);
    }
  }
}

// Handler para los crons
export async function handler15m() {
  await runAnalysis("15m");
}

export async function handler1h() {
  await runAnalysis("1h");
}

export async function handler4h() {
  await runAnalysis("4h");
}
