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

  let msg = `📊 <b>RESUMEN DEL DÍA (Últimas 24h)</b>\n`;
  msg += `<b>Tomadas (${dailyStats.tomadas.count}):</b> WR ${dailyStats.tomadas.winrate.toFixed(1)}% | E(R) = ${dailyStats.tomadas.exp.toFixed(2)}R\n`;
  msg += `<b>Descartadas (${dailyStats.desc.count}):</b> WR ${dailyStats.desc.winrate.toFixed(1)}% | E(R) = ${dailyStats.desc.exp.toFixed(2)}R\n`;
  msg += `Resultado Neto Diario: <b>${dailyStats.tomadas.totalR > 0 ? '+' : ''}${dailyStats.tomadas.totalR.toFixed(2)} R</b>\n`;
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

  let msg = `📈 <b>AUDITORÍA CUANTITATIVA GLOBAL (${diffDays} días operando)</b>\n`;
  msg += `<b>Muestra Tomada (${totalStats.tomadas.count}):</b> WR ${totalStats.tomadas.winrate.toFixed(1)}% | Expectativa: ${totalStats.tomadas.exp.toFixed(2)}R por trade.\n`;
  msg += `<b>Muestra Descartada (${totalStats.desc.count}):</b> WR ${totalStats.desc.winrate.toFixed(1)}% | Expectativa: ${totalStats.desc.exp.toFixed(2)}R por trade.\n`;
  
  const difWr = totalStats.tomadas.winrate - totalStats.desc.winrate;
  
  msg += `\n🧠 <b>Evaluación del Filtro Humano (Descartes):</b>\n`;
  msg += `Diferencia de Winrate (Tomadas vs Descartadas): ${difWr > 0 ? '+' : ''}${difWr.toFixed(1)}%\n`;
  
  if (totalStats.desc.exp > 0) {
    msg += `❌ <b>Atención:</b> Las operaciones que descartas tienen expectativa positiva (+${totalStats.desc.exp.toFixed(2)}R).\n`;
    msg += `👉 El filtro manual te está <b>costando</b> ${totalStats.desc.exp.toFixed(2)}R por decisión.\n`;
  } else if (totalStats.desc.exp < 0) {
    msg += `✅ <b>Bien visto:</b> Las operaciones que descartas tienen expectativa negativa (${totalStats.desc.exp.toFixed(2)}R).\n`;
    msg += `👉 El filtro manual te está <b>salvando</b> ${Math.abs(totalStats.desc.exp).toFixed(2)}R por decisión.\n`;
  } else {
    msg += `👉 El filtro manual tiene un impacto neutral (0.00R).\n`;
  }
  
  msg += `\nTotal R Acumulado (Solo Tomadas): <b>${totalStats.tomadas.totalR > 0 ? '+' : ''}${totalStats.tomadas.totalR.toFixed(2)} R</b>\n`;
  msg += `Máximo Drawdown (Caída desde el pico): <b>${totalStats.tomadas.maxDrawdownR.toFixed(2)} R</b>\n`;
  msg += `Peor Racha de Pérdidas: <b>${totalStats.tomadas.maxLosingStreak} operaciones seguidas</b>\n`;
  return msg;
}

export async function generateSimulationText(): Promise<string> {
  const allTrades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const tomadas = allTrades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  
  const calculateSim = (allocation: number) => {
    let balance = 1000;
    let totalCommissions = 0;
    let grossPnl = 0;
    const MAKER_FEE_ENTRY = 0.0002; // Limit Entry
    const TAKER_FEE_EXIT = 0.0005;  // Market Exit (SL/TP trigger)
    
    tomadas.forEach((t) => {
      const entry = parseFloat(t.entry!);
      const sl = parseFloat(t.stopLoss!);
      const tp = parseFloat(t.takeProfit!);
      
      let exitPrice = 0;
      if (t.decision!.includes("TP")) exitPrice = tp;
      else if (t.decision!.includes("SL")) exitPrice = sl;
      else return; 
      
      const entryFee = allocation * MAKER_FEE_ENTRY;
      const exitPositionSize = allocation * (exitPrice / entry);
      const exitFee = exitPositionSize * TAKER_FEE_EXIT;
      const tradeFee = entryFee + exitFee;
      
      let pnl = 0;
      if (t.direction === "LONG") {
        pnl = allocation * ((exitPrice - entry) / entry);
      } else {
        pnl = allocation * ((entry - exitPrice) / entry);
      }
      
      const netPnl = pnl - tradeFee;
      balance += netPnl;
      grossPnl += pnl;
      totalCommissions += tradeFee;
    });
    
    return { grossPnl, totalCommissions, balance };
  };

  const sim1 = calculateSim(500); // 1x nominal (500 USDT risk per trade out of 1000)

  let msg = `\n### 📊 SIMULACIÓN CUANTITATIVA (Muestra: ${tomadas.length} Operaciones Tomadas)\n`;
  msg += `<b>Estrategia:</b> 15m Tendencia/Rango (Basado en datos de ejecución en vivo)\n`;
  msg += `<b>Capital Inicial Base:</b> $1,000.00 USDT\n`;
  msg += `<b>Comisiones Calculadas:</b> Maker 0.02% (Entrada Límite) / Taker 0.05% (Salida a Mercado)\n\n`;

  msg += `<b>--- ESCENARIO: APALANCAMIENTO 1x (Estructural Base) ---</b>\n`;
  msg += `* Tamaño Nominal por Operación: $500 USDT\n`;
  msg += `* Riesgo por Operación (1 o 1.5 ATR): ~$2.50 a $7.50 USDT (0.25% - 0.75% de la cuenta)\n`;
  msg += `* Ganancia Bruta: +$${sim1.grossPnl.toFixed(2)}\n`;
  msg += `* Comisiones Binance: -$${sim1.totalCommissions.toFixed(2)}\n`;
  msg += `* PnL Neto: +$${(sim1.balance - 1000).toFixed(2)}\n`;
  msg += `* BALANCE FINAL: $${sim1.balance.toFixed(2)}\n`;

  return msg;
}

export async function handler() {
  console.log("Generando reportes diarios y totales cuantitativos...");

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
  
  let msg = `🌙 <b>FIN DE LA JORNADA INSTITUCIONAL (23:00 PYT)</b> 🌙\n`;
  msg += `El bot entra en auto-suspensión hasta las 08:30 am.\n\n`;
  
  msg += `💼 <b>Balance Actual (Binance):</b> $${liveBalance.toFixed(2)} USDT\n`;
  msg += `📈 <b>PnL Real del Día:</b> ${netPnlReal >= 0 ? '+' : ''}$${netPnlReal.toFixed(2)} USDT\n\n`;
  
  msg += dailyText + "\n\n" + globalText;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" });
    } catch (e) {
      console.error(`Error enviando reporte a ${user.chatId}`, e);
    }
  }
}
