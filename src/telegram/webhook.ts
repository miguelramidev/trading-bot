import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { db } from "../db/index.js";
import { userConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";

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
