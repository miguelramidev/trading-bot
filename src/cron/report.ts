import { Telegraf } from "telegraf";
import { Resource } from "sst";
import { db } from "../db/index.js";
import { signalHistory, userConfig, dailyReports } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";

const telegramToken = process.env.TELEGRAM_TOKEN || Resource.TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

function getR(trade: any): number {
  const entry = parseFloat(trade.entry);
  const sl = parseFloat(trade.stopLoss);
  const tp = parseFloat(trade.takeProfit);
  if (entry === sl) return 1.0; // Evitar división por cero
  
  // En lugar de asumir un R:R fijo, medimos el ratio real de las líneas de Take Profit y Stop Loss.
  return Math.abs((tp - entry) / (entry - sl));
}

function calculateStats(trades: any[]) {
  const tomadas = trades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  const descartadas = trades.filter(t => t.decision && t.decision.startsWith("Descartada"));
  
  let tomadasTP = 0, tomadasSL = 0, tomadasR = 0;
  let currentR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  let currentStreak = 0;
  let maxLosingStreak = 0;

  tomadas.forEach(t => {
    if (t.decision.includes("TP Tocado")) { 
      tomadasTP++; 
      const r = getR(t);
      tomadasR += r; 
      currentR += r;
      if (currentR > peakR) peakR = currentR;
      currentStreak = 0; 
    }
    else if (t.decision.includes("SL Tocado")) { 
      tomadasSL++; 
      tomadasR -= 1; 
      currentR -= 1;
      currentStreak++;
      if (currentStreak > maxLosingStreak) maxLosingStreak = currentStreak;
    }
    const drawdown = currentR - peakR;
    if (drawdown < maxDrawdownR) maxDrawdownR = drawdown;
  });
  
  let descTP = 0, descSL = 0, descR = 0;
  descartadas.forEach(t => {
    if (t.decision.includes("TP Tocado")) { descTP++; descR += getR(t); }
    else if (t.decision.includes("SL Tocado")) { descSL++; descR -= 1; }
  });
  
  const tomadasTotal = tomadasTP + tomadasSL;
  const descTotal = descTP + descSL;
  
  const winrateTomadas = tomadasTotal > 0 ? (tomadasTP / tomadasTotal) : 0;
  const winrateDesc = descTotal > 0 ? (descTP / descTotal) : 0;
  
  const expTomadas = tomadasTotal > 0 ? (tomadasR / tomadasTotal) : 0;
  const expDesc = descTotal > 0 ? (descR / descTotal) : 0;

  return {
    tomadas: { count: tomadasTotal, winrate: winrateTomadas * 100, exp: expTomadas, totalR: tomadasR, maxDrawdownR, maxLosingStreak },
    desc: { count: descTotal, winrate: winrateDesc * 100, exp: expDesc, totalR: descR }
  };
}

export async function generateDailyReportText(): Promise<string> {
  const allTrades = await db.query.signalHistory.findMany();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dailyTrades = allTrades.filter(t => t.evaluatedAt >= yesterday);
  const dailyStats = calculateStats(dailyTrades);

  let msg = `📊 <b>RESUMEN DE SEÑALES DEL DÍA (Últimas 24h)</b>\n`;
  msg += `<b>Operaciones que TOMASTE (${dailyStats.tomadas.count}):</b>\n`;
  msg += `  ✅ Ganadas (TP): ${dailyTrades.filter(t => t.decision?.includes("Tomada") && t.decision?.includes("TP")).length}\n`;
  msg += `  ❌ Perdidas (SL): ${dailyTrades.filter(t => t.decision?.includes("Tomada") && t.decision?.includes("SL")).length}\n`;
  msg += `  🎯 Tasa de Acierto: ${dailyStats.tomadas.winrate.toFixed(1)}%\n\n`;
  
  msg += `<b>Operaciones que DESCARTASTE (${dailyStats.desc.count}):</b>\n`;
  msg += `  ✅ Hubieran ganado (TP): ${dailyTrades.filter(t => t.decision?.includes("Descartada") && t.decision?.includes("TP")).length}\n`;
  msg += `  ❌ Hubieran perdido (SL): ${dailyTrades.filter(t => t.decision?.includes("Descartada") && t.decision?.includes("SL")).length}\n`;
  msg += `  🎯 Tasa de Acierto: ${dailyStats.desc.winrate.toFixed(1)}%\n`;
  return msg;
}

export async function generateGlobalReportText(): Promise<string> {
  const allTrades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const totalStats = calculateStats(allTrades);
  
  let diffDays = 0;
  if (allTrades.length > 0) {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - allTrades[0].evaluatedAt.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  let msg = `📈 <b>AUDITORÍA GLOBAL (Tras ${diffDays} días operando)</b>\n`;
  
  msg += `<b>Operaciones TOMASTE en total (${totalStats.tomadas.count}):</b>\n`;
  msg += `  ✅ Ganadas: ${allTrades.filter(t => t.decision?.includes("Tomada") && t.decision?.includes("TP")).length}\n`;
  msg += `  ❌ Perdidas: ${allTrades.filter(t => t.decision?.includes("Tomada") && t.decision?.includes("SL")).length}\n`;
  msg += `  🎯 Tasa de Acierto: ${totalStats.tomadas.winrate.toFixed(1)}%\n\n`;

  msg += `<b>Operaciones DESCARTASTE en total (${totalStats.desc.count}):</b>\n`;
  msg += `  ✅ Hubieran ganado: ${allTrades.filter(t => t.decision?.includes("Descartada") && t.decision?.includes("TP")).length}\n`;
  msg += `  ❌ Hubieran perdido: ${allTrades.filter(t => t.decision?.includes("Descartada") && t.decision?.includes("SL")).length}\n`;
  msg += `  🎯 Tasa de Acierto: ${totalStats.desc.winrate.toFixed(1)}%\n\n`;
  
  const difWr = totalStats.tomadas.winrate - totalStats.desc.winrate;
  
  msg += `🧠 <b>Evaluación de tus decisiones (Filtro Humano):</b>\n`;
  
  if (difWr > 5) {
    msg += `✅ <b>¡Excelente instinto!</b> Tu tasa de acierto es ${difWr.toFixed(1)}% mejor que si hubieras aceptado las que descartaste. Estás filtrando bien las trampas.\n`;
  } else if (difWr < -5) {
    msg += `❌ <b>Cuidado con el sesgo:</b> Las operaciones que descartas están ganando ${Math.abs(difWr).toFixed(1)}% más que las que aceptas. Intenta confiar un poco más en el modelo matemático.\n`;
  } else {
    msg += `👉 Tus decisiones manuales están empatadas con el algoritmo. Tu instinto está perfectamente calibrado con la matemática.\n`;
  }
  
  return msg;
}

export async function handler() {
  console.log("Generando reportes diarios...");

  const users = await db.query.userConfig.findMany();
  if (users.length === 0) return;
  
  const fetcher = new DataFetcher();
  const liveBalance = await fetcher.getUSDTBalance();
  
  const lastReport = await db.query.dailyReports.findFirst({
    orderBy: (reports, { desc }) => [desc(reports.reportDate)]
  });
  
  const startingBalance = lastReport ? parseFloat(lastReport.balance) : 41.78;
  const netPnlReal = liveBalance - startingBalance;
  
  await db.insert(dailyReports).values({
    balance: liveBalance.toFixed(2),
    netPnl: netPnlReal.toFixed(2),
  });

  const dailyText = await generateDailyReportText();
  const globalText = await generateGlobalReportText();
  
  let msg = `🌙 <b>REPORTE DIARIO DE RENDIMIENTO (23:00 PYT)</b> 🌙\n`;
  msg += `<i>(El bot seguirá operando 24/7 a menos que envíes /pause)</i>\n\n`;
  
  msg += `💼 <b>Balance Actual (Binance):</b> $${liveBalance.toFixed(2)} USDT\n`;
  msg += `📈 <b>Ganancia/Pérdida (Últimas 24h):</b> ${netPnlReal >= 0 ? '+' : ''}$${netPnlReal.toFixed(2)} USDT\n\n`;
  
  msg += dailyText + "\n" + globalText;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(`Error enviando reporte a ${user.chatId}`, e);
    }
  }
}
