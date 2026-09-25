import fs from 'fs';
let c = fs.readFileSync('src/telegram/webhook.ts', 'utf8');

c = c.replace('import { Trader } from "../bot/trader.js";', 'import { Trader } from "../bot/trader.js";\nimport { decrypt } from "../api/core/utils/encryption.js";');

c = c.replace(/bot\.command\("positions", async \(ctx\) => \{[\s\S]*?const binanceKey = process\.env\.BINANCE_API_KEY[\s\S]*?const binanceSecret = process\.env\.BINANCE_API_SECRET[\s\S]*?if \(!binanceKey \|\| !binanceSecret\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?try \{[\s\S]*?const secretKey = binanceSecret\.replace\(\/\\\\n\/g, '\\\\n'\);[\s\S]*?const exchange = new ccxt\.binance\(\{[\s\S]*?apiKey: binanceKey,[\s\S]*?secret: secretKey,/, `bot.command("positions", async (ctx) => {
  await ctx.reply("⏳ Consultando operaciones abiertas en Binance...");
  const chatId = ctx.chat.id.toString();
  const user = await db.query.userConfig.findFirst({ where: eq(userConfig.chatId, chatId) });
  
  if (!user || !user.binanceApiKey) {
    await ctx.reply("❌ Error: Faltan credenciales de Binance. Configúralas en la App.");
    return;
  }

  try {
    const binanceKey = decrypt(user.binanceApiKey);
    const binanceSecret = decrypt(user.binanceApiSecret || "");
    const exchange = new ccxt.binance({
      apiKey: binanceKey,
      secret: binanceSecret,`);

const traderRegex = /const trader = new Trader\(\);/;
c = c.replace(traderRegex, `const chatId = ctx.chat?.id.toString();
  const user = await db.query.userConfig.findFirst({ where: eq(userConfig.chatId, chatId || "") });
  if (!user || !user.binanceApiKey) {
    await ctx.answerCbQuery("❌ Configura tus API Keys en la app primero.");
    return;
  }
  const userKey = decrypt(user.binanceApiKey);
  const userSecret = decrypt(user.binanceApiSecret || "");
  const trader = new Trader(userKey, userSecret);`);

fs.writeFileSync('src/telegram/webhook.ts', c);
