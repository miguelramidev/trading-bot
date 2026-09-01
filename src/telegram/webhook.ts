import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "../db/index.js";
import { userConfig, signalHistory } from "../db/schema.js";
import { eq } from "drizzle-orm";
import ccxt from "ccxt";
import { Resource } from "sst";

const telegramToken = process.env.TELEGRAM_TOKEN || Resource.TELEGRAM_TOKEN.value;
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
  await ctx.reply(`Estado del bot: ${status}\nApalancamiento actual: ${config.leverage}x`);
});

bot.command("leverage", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const args = ctx.message.text.split(" ");
  
  if (args.length < 2) {
    const config = await db.query.userConfig.findFirst({
      where: eq(userConfig.chatId, chatId),
    });
    const current = config?.leverage || 1;
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
    .values({ chatId, leverage: newLeverage })
    .onConflictDoUpdate({
      target: userConfig.chatId,
      set: { leverage: newLeverage, updatedAt: new Date() },
    });
    
  await ctx.reply(`✅ Apalancamiento actualizado a ${newLeverage}x.`);
});

bot.command("positions", async (ctx) => {
  await ctx.reply("⏳ Consultando operaciones abiertas en Binance...");
  
  const binanceKey = process.env.BINANCE_API_KEY || Resource.BINANCE_API_KEY.value;
  const binanceSecret = process.env.BINANCE_API_SECRET || Resource.BINANCE_API_SECRET.value;

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
      const isLong = p.side === 'long' || p.positionSide === 'LONG';
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

bot.action(/^ask_amount_(\d+)$/, async (ctx) => {
  const signalId = parseInt(ctx.match[1]);
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return;

  await ctx.answerCbQuery("Consultando balance en Binance...");

  const binanceKey = process.env.BINANCE_API_KEY || Resource.BINANCE_API_KEY.value;
  const binanceSecret = process.env.BINANCE_API_SECRET || Resource.BINANCE_API_SECRET.value;

  if (!binanceKey || !binanceSecret) {
    await ctx.reply("❌ Error: Faltan credenciales de Binance (API_KEY o SECRET) en el entorno.");
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

    const balance = await exchange.fetchBalance();
    const usdtBalance = balance.USDT?.free || 0;

    const config = await db.query.userConfig.findFirst({
      where: eq(userConfig.chatId, chatId),
    });
    const leverage = config?.leverage || 1;

    // Guardar el estado en la base de datos
    await db.update(userConfig)
      .set({ pendingSignalId: signalId, updatedAt: new Date() })
      .where(eq(userConfig.chatId, chatId));

    await ctx.reply(`💰 <b>Balance Disponible:</b> $${usdtBalance.toFixed(2)} USDT\n` +
      `⚡ <b>Apalancamiento Actual:</b> ${leverage}x\n\n` +
      `✍️ <b>Escribe en el chat el margen en USDT que deseas invertir en esta operación:</b>\n` +
      `(Ejemplo: si escribes <i>25</i> con 5x, la posición será de $125)`, { parse_mode: "HTML" });

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

    const secretKey = binanceSecret.replace(/\\n/g, '\n');
    const exchange = new ccxt.binance({
      apiKey: binanceKey,
      secret: secretKey,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    const entryPrice = parseFloat(signal.entry);
    const slPrice = parseFloat(signal.stopLoss);
    const tpPrice = parseFloat(signal.takeProfit);
    const isLong = signal.direction === "LONG";
    const side = isLong ? "buy" : "sell";
    const oppositeSide = isLong ? "sell" : "buy";
    
    const leverage = config.leverage || 1;

    let amount = (usdAmount * leverage) / entryPrice;

    await exchange.loadMarkets();
    const market = exchange.markets[signal.symbol];
    if (market) {
      amount = parseFloat(exchange.amountToPrecision(signal.symbol, amount));
    }

    const minNotional = parseFloat(signal.minNotional || "5");
    if (amount * entryPrice < minNotional) {
      await ctx.reply(`❌ El tamaño de la orden pos-apalancamiento ($${(amount*entryPrice).toFixed(2)}) es menor al mínimo requerido de $${minNotional.toFixed(2)} USDT en Binance para este par.`);
      return;
    }

    const initialMsg = await ctx.reply(`⏳ Colocando orden Limit en ${signal.symbol} por un valor total de $${(usdAmount * leverage).toFixed(2)} (${amount} tokens)...`);

    // 0. Configurar apalancamiento real
    try {
      await exchange.setLeverage(leverage, signal.symbol);
    } catch (e: any) {
      console.log(`Nota: No se pudo modificar el apalancamiento para ${signal.symbol}:`, e.message);
    }

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

    // (Omitido) No guardamos estado de operaciones activas porque la estrategia es 1:1 estática

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
