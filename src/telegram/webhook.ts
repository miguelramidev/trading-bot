import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "../db/index.js";
import { userConfig, signalHistory } from "../db/schema.js";
import { eq } from "drizzle-orm";
import ccxt from "ccxt";
import { Resource } from "sst";
import { Trader } from "../bot/trader.js";
import { decrypt } from "../api/core/utils/encryption.js";

const telegramToken = process.env.TELEGRAM_TOKEN || (Resource as any).TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  // Upsert user config
  await db
    .insert(userConfig)
    .values({ chatId, isPaused: false })
    .onConflictDoUpdate({
      target: userConfig.chatId,
      set: { isPaused: false, updatedAt: new Date() },
    });
    
  await ctx.reply("🤖 Crypto Signal Bot Serverless iniciado.\nUsa /pause para detener las alertas y /resume para reanudarlas.");
});

bot.command("pause", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  await db
    .insert(userConfig)
    .values({ chatId, isPaused: true })
    .onConflictDoUpdate({
      target: userConfig.chatId,
      set: { isPaused: true, updatedAt: new Date() },
    });
    
  await ctx.reply("⏸️ Bot pausado. No recibirás más señales.");
});

bot.command("resume", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  await db
    .insert(userConfig)
    .values({ chatId, isPaused: false })
    .onConflictDoUpdate({
      target: userConfig.chatId,
      set: { isPaused: false, updatedAt: new Date() },
    });
    
  await ctx.reply("▶️ Bot reanudado.");
});

bot.command("status", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const config = await db.query.userConfig.findFirst({
    where: eq(userConfig.chatId, chatId),
  });
  
  if (!config) {
    await ctx.reply("No te tengo en la base de datos. Usa /start primero.");
    return;
  }
  
  const status = config.isPaused ? "Pausado ⏸️" : "Activo ▶️";
  await ctx.reply(`Estado del bot: ${status}\nApalancamiento actual: ${config.apalancamiento ?? 10}x`);
});

bot.command("leverage", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const args = ctx.message.text.split(" ");
  
  if (args.length < 2) {
    const config = await db.query.userConfig.findFirst({
      where: eq(userConfig.chatId, chatId),
    });
    const current = config?.apalancamiento ?? 10;
    await ctx.reply(`Apalancamiento actual: ${current}x\nUsa /leverage [1-125] para cambiarlo.`);
    return;
  }
  
  const newLeverage = parseInt(args[1]);
  if (isNaN(newLeverage) || newLeverage < 1 || newLeverage > 125) {
    await ctx.reply("❌ Multiplicador inválido. Usa un número entre 1 y 125.");
    return;
  }
  
  await db
    .insert(userConfig)
    .values({ chatId, apalancamiento: newLeverage })
    .onConflictDoUpdate({
      target: userConfig.chatId,
      set: { apalancamiento: newLeverage, updatedAt: new Date() },
    });
    
  await ctx.reply(`✅ Apalancamiento actualizado a ${newLeverage}x.`);
});

bot.command("positions", async (ctx) => {
  await ctx.reply("⏳ Consultando operaciones abiertas en Binance...");
  
  const binanceKey = process.env.BINANCE_API_KEY || (Resource as any).BINANCE_API_KEY.value;
  const binanceSecret = process.env.BINANCE_API_SECRET || (Resource as any).BINANCE_API_SECRET.value;

  if (!binanceKey || !binanceSecret) {
    await ctx.reply("❌ Error: Faltan credenciales de Binance.");
    return;
  }

  try {
    const secretKey = binanceSecret.replace(/\\n/g, '\n');
    const exchange = new ccxt.binance({
      apiKey: binanceKey,
      secret: secretKey,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    const positions = await exchange.fetchPositions();
    const openPositions = positions.filter((p: any) => p.contracts && p.contracts > 0);

    if (openPositions.length === 0) {
      await ctx.reply("No tienes ninguna operación abierta en este momento. 😴");
      return;
    }

    let message = `📊 <b>POSICIONES ABIERTAS (${openPositions.length})</b>\n\n`;

    for (const p of openPositions) {
      const isLong = p.side === 'long' || (p as any).positionSide === 'LONG';
      const sideEmoji = isLong ? "🟢 LONG" : "🔴 SHORT";
      const pnl = p.unrealizedPnl || 0;
      const roe = p.percentage || 0;
      const pnlEmoji = pnl >= 0 ? "🤑" : "🩸";
      
      message += `🪙 <b>${p.symbol}</b> (${sideEmoji})\n`;
      message += `🛒 Entrada: ${p.entryPrice}\n`;
      message += `💵 Actual: ${p.markPrice}\n`;
      message += `${pnlEmoji} PnL: <b>$${pnl.toFixed(2)} USDT</b> (${roe.toFixed(2)}%)\n\n`;
    }

    await ctx.reply(message, { parse_mode: "HTML" });

  } catch (error: any) {
    console.error("Posiciones Error:", error);
    await ctx.reply(`❌ Error al consultar posiciones: ${error.message}`);
  }
});

bot.command("report_daily", async (ctx) => {
  await ctx.reply("⏳ Generando reporte diario en vivo...");
  try {
    const { generateDailyReportText } = await import("../cron/report.js");
    const reportText = await generateDailyReportText();
    let msg = `🔥 <b>REPORTE DIARIO SOLICITADO MANUALMENTE</b> 🔥\n\n`;
    msg += reportText;
    await ctx.reply(msg, { parse_mode: "HTML" });
  } catch (e: any) {
    console.error("Error generating daily report manually:", e);
    await ctx.reply("❌ Ocurrió un error al generar el reporte diario.");
  }
});

bot.command("report_global", async (ctx) => {
  await ctx.reply("⏳ Generando auditoría global en vivo...");
  try {
    const { generateGlobalReportText } = await import("../cron/report.js");
    const reportText = await generateGlobalReportText();
    let msg = `🔥 <b>AUDITORÍA GLOBAL SOLICITADA MANUALMENTE</b> 🔥\n\n`;
    msg += reportText;
    await ctx.reply(msg, { parse_mode: "HTML" });
  } catch (e: any) {
    console.error("Error generating global report manually:", e);
    await ctx.reply("❌ Ocurrió un error al generar la auditoría global.");
  }
});

bot.command("report_advisor", async (ctx) => {
  await ctx.reply("⏳ Recopilando datos cuantitativos y de simulación para el asesor...");
  try {
    const { generateGlobalReportText } = await import("../cron/report.js");
    const globalText = await generateGlobalReportText();
    let msg = `🔥 <b>DOSSIER PARA ASESOR</b> 🔥\n\n`;
    msg += globalText;
    await ctx.reply(msg, { parse_mode: "HTML" });
  } catch (e: any) {
    console.error("Error generating advisor report manually:", e);
    await ctx.reply("❌ Ocurrió un error al generar el reporte para el asesor.");
  }
});

bot.action(/^paper_accept_(\d+)$/, async (ctx) => {
  const signalId = parseInt(ctx.match[1]);
  
  const signal = await db.query.signalHistory.findFirst({
    where: eq(signalHistory.id, signalId)
  });

  if (!signal) {
    await ctx.answerCbQuery("❌ Señal no encontrada.");
    return;
  }

  if (signal.decision) {
    await ctx.answerCbQuery(`❌ Esta señal ya fue procesada (${signal.decision.split("->")[0].trim()}).`);
    return;
  }

  const timeDiff = Date.now() - signal.evaluatedAt.getTime();
  if (timeDiff > 15 * 60 * 1000) {
    await db.update(signalHistory).set({ decision: "Ignorada" }).where(eq(signalHistory.id, signalId));
    await ctx.answerCbQuery("⏳ Esta señal ha expirado (pasaron más de 15 min).");
    const originalMsg = ctx.callbackQuery.message;
    if (originalMsg && 'text' in originalMsg) {
       await ctx.editMessageText(originalMsg.text + "\n\n⏳ <b>DECISIÓN: IGNORADA (Expiró)</b>", { parse_mode: "HTML" });
    }
    return;
  }
  
  await ctx.answerCbQuery("⏳ Ejecutando orden en Binance...");

  const chatId = ctx.chat?.id.toString();
  const user = await db.query.userConfig.findFirst({ where: eq(userConfig.chatId, chatId || "") });
  if (!user || !user.binanceApiKey) {
    await ctx.answerCbQuery("❌ Configura tus API Keys en la app primero.");
    return;
  }
  const userKey = decrypt(user.binanceApiKey);
  let userSecret = "";
  if (user.rsaPrivateKey) {
    userSecret = decrypt(user.rsaPrivateKey);
  } else if (user.binanceApiSecret) {
    userSecret = decrypt(user.binanceApiSecret);
  }
  const trader = new Trader(userKey, userSecret);
  const executionResult = await trader.executeTrade(
     signal.symbol,
     signal.direction!,
     parseFloat(signal.gridSL || "0"),
     parseFloat(signal.gridTP || "0"),
     user.montoOperacion ? parseFloat(user.montoOperacion.toString()) : 25.0,
     user.apalancamiento ?? 10
  );

  let finalDecision = "Tomada";
  let reasonText = "Ejecutado en Binance: OCO Sniper";

  if (executionResult.includes("❌")) {
      finalDecision = "Descartada";
      reasonText = executionResult.substring(0, 100); // Guardamos el error de rechazo
  }

  await db.update(signalHistory)
    .set({ decision: finalDecision, reason: reasonText, isActiveTrade: true })
    .where(eq(signalHistory.id, signalId));
  
  const originalMsg = ctx.callbackQuery.message;
  if (originalMsg && 'text' in originalMsg) {
     const statusHeader = finalDecision === "Tomada" ? "✅ <b>TRADE EJECUTADO REAL (Sniper)</b>" : "❌ <b>TRADE RECHAZADO POR BINANCE</b>";
     await ctx.editMessageText(originalMsg.text + `\n\n${statusHeader}\n\n${executionResult}`, { parse_mode: "HTML" });
  }
});

bot.action(/^paper_reject_(\d+)$/, async (ctx) => {
  const signalId = parseInt(ctx.match[1]);
  
  const signal = await db.query.signalHistory.findFirst({
    where: eq(signalHistory.id, signalId)
  });

  if (!signal) {
    await ctx.answerCbQuery("❌ Señal no encontrada.");
    return;
  }

  if (signal.decision) {
    await ctx.answerCbQuery(`❌ Esta señal ya fue procesada (${signal.decision.split("->")[0].trim()}).`);
    return;
  }

  const timeDiff = Date.now() - signal.evaluatedAt.getTime();
  if (timeDiff > 15 * 60 * 1000) {
    await db.update(signalHistory).set({ decision: "Ignorada" }).where(eq(signalHistory.id, signalId));
    await ctx.answerCbQuery("⏳ Esta señal ha expirado (pasaron más de 15 min).");
    const originalMsg = ctx.callbackQuery.message;
    if (originalMsg && 'text' in originalMsg) {
       await ctx.editMessageText(originalMsg.text + "\n\n⏳ <b>DECISIÓN: IGNORADA (Expiró)</b>", { parse_mode: "HTML" });
    }
    return;
  }

  await db.update(signalHistory)
    .set({ decision: "Descartada", isActiveTrade: false })
    .where(eq(signalHistory.id, signalId));

  await ctx.answerCbQuery("❌ Trade descartado. Te preguntaré el motivo.");
  
  const originalMsg = ctx.callbackQuery.message;
  if (originalMsg && 'text' in originalMsg) {
     await ctx.editMessageText(originalMsg.text + "\n\n❌ <b>DECISIÓN: DESCARTADA</b>", { parse_mode: "HTML" });
  }

  await ctx.reply(`✍️ Responde a este mensaje indicando el motivo por el cual descartaste la señal #${signalId}:`, {
    reply_markup: {
      force_reply: true
    }
  });
});

bot.on(message("text"), async (ctx) => {
  // Manejar la respuesta del motivo de descarte
  if (ctx.message.reply_to_message && 'text' in ctx.message.reply_to_message) {
    const promptText = ctx.message.reply_to_message.text;
    const match = promptText.match(/señal #(\d+)/);
    if (match) {
      const signalId = parseInt(match[1]);
      const reason = ctx.message.text.trim();
      
      await db.update(signalHistory)
        .set({ reason: reason })
        .where(eq(signalHistory.id, signalId));
        
      await ctx.reply(`✅ Motivo registrado para la señal #${signalId}. El bot seguirá monitoreando la moneda en silencio para que luego puedas auditar si hiciste bien en descartarla.`);
      return;
    }
  }
});

export async function handler(event: any) {
  try {
    const body = JSON.parse(event.body || "{}");
    await bot.handleUpdate(body);
    return { statusCode: 200, body: "OK" };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: "Error" };
  }
}
