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

bot.action(/^execute_(\d+)_(\d+)$/, async (ctx) => {
  const signalId = parseInt(ctx.match[1]);
  const usdAmount = parseInt(ctx.match[2]); // 15, 20, 25, 30

  // Respond to Telegram immediately to clear loading state
  await ctx.answerCbQuery(`Procesando orden de $${usdAmount}...`);

  try {
    const signal = await db.query.signalHistory.findFirst({
      where: eq(signalHistory.id, signalId),
    });

    if (!signal || !signal.entry || !signal.stopLoss || !signal.takeProfit) {
      await ctx.reply("❌ Error: No se encontró la señal o expiró de la base de datos.");
      return;
    }

    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      await ctx.reply("❌ Error: API Keys de Binance no configuradas.");
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

    // Calcular la cantidad de monedas exacta (Size)
    // Formula: cantidad = Capital / Precio Entrada (apalancamiento 1x)
    let amount = usdAmount / entryPrice;

    // Obtener la precisión del mercado (Tick Size, Step Size)
    await exchange.loadMarkets();
    const market = exchange.markets[signal.symbol];
    if (market) {
      amount = parseFloat(exchange.amountToPrecision(signal.symbol, amount));
    }

    const minNotional = parseFloat(signal.minNotional || "5");
    if (amount * entryPrice < minNotional) {
      await ctx.reply(`❌ El tamaño de la orden ($${(amount*entryPrice).toFixed(2)}) es menor al mínimo requerido de $${minNotional.toFixed(2)}.`);
      return;
    }

    await ctx.reply(`⏳ Colocando orden Limit en ${signal.symbol} por $${usdAmount} (${amount} tokens)...`);

    // 1. Crear Orden Limit
    const limitOrder = await exchange.createOrder(signal.symbol, 'limit', side, amount, entryPrice, {
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

    await ctx.reply(`✅ <b>¡Operación Colocada con Éxito!</b> 🚀\n` +
      `🪙 Par: ${signal.symbol}\n` +
      `🛒 Limit: ${entryPrice}\n` +
      `🛑 Stop Loss: ${slPrice}\n` +
      `🎯 Take Profit: ${tpPrice}`, { parse_mode: "HTML" });

    // Modificar el mensaje original para que el botón ya no aparezca
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const msg = ctx.callbackQuery.message;
      await ctx.editMessageReplyMarkup(undefined);
    }
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
