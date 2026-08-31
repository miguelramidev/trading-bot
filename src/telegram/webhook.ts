import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "../db/index.js";
import { userConfig, signalHistory } from "../db/schema.js";
import { eq } from "drizzle-orm";
import ccxt from "ccxt";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

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
  await ctx.reply(`Estado del bot: ${status}`);
});

bot.action(/^ask_amount_(\d+)$/, async (ctx) => {
  const signalId = parseInt(ctx.match[1]);
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return;

  await ctx.answerCbQuery("Consultando balance en Binance...");

  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    await ctx.reply("❌ Error: API Keys de Binance no configuradas en el .env");
    return;
  }

  try {
    const exchange = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_API_SECRET,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    const balance = await exchange.fetchBalance();
    const usdtBalance = balance.USDT?.free || 0;

    // Guardar el estado en la base de datos
    await db.update(userConfig)
      .set({ pendingSignalId: signalId, updatedAt: new Date() })
      .where(eq(userConfig.chatId, chatId));

    await ctx.reply(`💰 <b>Balance Disponible:</b> $${usdtBalance.toFixed(2)} USDT\n\n` +
      `✍️ <b>Escribe en el chat el monto en USDT que deseas invertir en esta operación:</b>\n` +
      `(Ejemplo: escribe <i>25</i> o <i>100</i>)`, { parse_mode: "HTML" });

  } catch (error: any) {
    console.error("Balance Error:", error);
    await ctx.reply(`❌ Error al consultar balance en Binance: ${error.message}`);
  }
});

bot.on(message("text"), async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const text = ctx.message.text.trim();

  // Buscar si el usuario tiene una señal pendiente de ejecución
  const config = await db.query.userConfig.findFirst({
    where: eq(userConfig.chatId, chatId),
  });

  if (!config || !config.pendingSignalId) {
    // No hay operación pendiente, ignorar el texto o responder a comandos normales
    return;
  }

  const signalId = config.pendingSignalId;
  const usdAmount = parseFloat(text);

  if (isNaN(usdAmount) || usdAmount <= 0) {
    await ctx.reply("❌ Por favor, escribe un número válido mayor a 0.");
    return;
  }

  // Limpiar el estado de pending (para evitar reintentos accidentales)
  await db.update(userConfig)
    .set({ pendingSignalId: null, updatedAt: new Date() })
    .where(eq(userConfig.chatId, chatId));

  try {
    const signal = await db.query.signalHistory.findFirst({
      where: eq(signalHistory.id, signalId),
    });

    if (!signal || !signal.entry || !signal.stopLoss || !signal.takeProfit) {
      await ctx.reply("❌ Error: No se encontró la señal o expiró.");
      return;
    }

    const exchange = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_API_SECRET,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    const entryPrice = parseFloat(signal.entry);
    const slPrice = parseFloat(signal.stopLoss);
    const tpPrice = parseFloat(signal.takeProfit);
    const isLong = signal.direction === "LONG";
    const side = isLong ? "buy" : "sell";
    const oppositeSide = isLong ? "sell" : "buy";

    let amount = usdAmount / entryPrice;

    await exchange.loadMarkets();
    const market = exchange.markets[signal.symbol];
    if (market) {
      amount = parseFloat(exchange.amountToPrecision(signal.symbol, amount));
    }

    const minNotional = parseFloat(signal.minNotional || "5");
    if (amount * entryPrice < minNotional) {
      await ctx.reply(`❌ El tamaño de la orden ($${(amount*entryPrice).toFixed(2)}) es menor al mínimo requerido de $${minNotional.toFixed(2)} USDT en Binance para este par.`);
      return;
    }

    const initialMsg = await ctx.reply(`⏳ Colocando orden Limit en ${signal.symbol} por $${usdAmount} (${amount} tokens)...`);

    // 1. Crear Orden Limit
    await exchange.createOrder(signal.symbol, 'limit', side, amount, entryPrice, {
      timeInForce: 'GTC'
    });

    // 2. Crear Stop Loss (Condicional Reduce Only)
    await exchange.createOrder(signal.symbol, 'STOP_MARKET', oppositeSide, amount, undefined, {
      stopPrice: slPrice,
      reduceOnly: true
    });

    // 3. Crear Take Profit (Condicional Reduce Only)
    await exchange.createOrder(signal.symbol, 'TAKE_PROFIT_MARKET', oppositeSide, amount, undefined, {
      stopPrice: tpPrice,
      reduceOnly: true
    });

    // 4. Marcar la señal como activa en la base de datos para monitoreo de Breakeven
    await db.update(signalHistory)
      .set({ isActiveTrade: true, breakevenMoved: false })
      .where(eq(signalHistory.id, signalId));

    await ctx.telegram.editMessageText(chatId, initialMsg.message_id, undefined, 
      `✅ <b>¡Operación Colocada con Éxito!</b> 🚀\n` +
      `🪙 Par: ${signal.symbol}\n` +
      `💵 Inversión: $${usdAmount}\n` +
      `🛒 Limit: ${entryPrice}\n` +
      `🛑 Stop Loss: ${slPrice}\n` +
      `🎯 Take Profit: ${tpPrice}`, { parse_mode: "HTML" });

  } catch (error: any) {
    console.error("Execute Order Error:", error);
    await ctx.reply(`❌ Error al ejecutar orden en Binance: ${error.message}`);
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
