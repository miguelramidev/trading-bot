import { Telegraf } from "telegraf";
import { db } from "../db/index.js";
import ccxt from "ccxt";
import { Resource } from "sst";

const telegramToken = process.env.TELEGRAM_TOKEN || Resource.TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

export async function handler() {
  console.log("Generando reporte diario de PnL...");

  const binanceKey = process.env.BINANCE_API_KEY || Resource.BINANCE_API_KEY.value;
  const binanceSecret = process.env.BINANCE_API_SECRET || Resource.BINANCE_API_SECRET.value;

  if (!binanceKey || !binanceSecret) {
    console.log("No hay API Keys de Binance configuradas. Abortando reporte.");
    return;
  }

  try {
    const rawSecret = binanceSecret.replace(/\\n/g, '\n');
    const exchange = new ccxt.binance({
      apiKey: binanceKey,
      secret: rawSecret,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    const since = Date.now() - 24 * 60 * 60 * 1000; // Últimas 24 horas

    // Obtener PnL realizado
    const income = await exchange.fetchIncome(undefined, since, undefined, { incomeType: 'REALIZED_PNL' });
    
    // Obtener comisiones pagadas
    const commissions = await exchange.fetchIncome(undefined, since, undefined, { incomeType: 'COMMISSION' });

    let totalPnl = 0;
    let totalCommissions = 0;
    let wins = 0;
    let losses = 0;

    for (const item of income) {
      if (item.amount > 0) {
        totalPnl += item.amount;
        wins++;
      } else if (item.amount < 0) {
        totalPnl += item.amount;
        losses++;
      }
    }

    for (const item of commissions) {
      totalCommissions += item.amount;
    }

    // El monto de comisiones viene negativo generalmente, lo sumamos al PnL para el neto
    const netPnl = totalPnl + totalCommissions;
    
    const totalTrades = wins + losses;
    const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";

    const emoji = netPnl >= 0 ? "🟢" : "🔴";
    const netPnlFormatted = netPnl.toFixed(2);
    
    const message = `📊 <b>REPORTE DIARIO DE TRADING</b>\n\n` +
                    `${emoji} <b>PnL Neto (24h):</b> $${netPnlFormatted} USDT\n\n` +
                    `📈 <b>Operaciones Cerradas:</b> ${totalTrades}\n` +
                    `🏆 <b>Ganadoras (TP):</b> ${wins}\n` +
                    `💀 <b>Perdedoras (SL):</b> ${losses}\n` +
                    `🎯 <b>Winrate:</b> ${winrate}%\n` +
                    `💸 <b>Comisiones pagadas:</b> $${Math.abs(totalCommissions).toFixed(2)} USDT\n\n` +
                    `<i>Reporte generado automáticamente.</i>`;

    const users = await db.query.userConfig.findMany();
    for (const u of users) {
      if (!u.isPaused) {
        await bot.telegram.sendMessage(u.chatId, message, { parse_mode: "HTML" });
      }
    }

    console.log("Reporte enviado con éxito.");

  } catch (error) {
    console.error("Error generando reporte:", error);
  }
}
