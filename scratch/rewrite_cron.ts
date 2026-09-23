import fs from "fs";

let content = fs.readFileSync("src/cron/report.ts", "utf8");

// Remove global DataFetcher logic and replace with per-user CCXT balance fetching
// I will just rewrite the handler function.
const handlerReplacement = `import { decrypt } from "../api/core/utils/encryption.js";
import ccxt from "ccxt";

export async function handler() {
  console.log("Generando reportes diarios (Snapshots de capital)...");

  const users = await db.query.userConfig.findMany();
  if (users.length === 0) return;
  
  for (const user of users) {
    if (!user.binanceApiKey || (!user.binanceApiSecret && !user.rsaPrivateKey)) continue;
    
    try {
      const apiKey = decrypt(user.binanceApiKey);
      const secret = user.binanceApiSecret ? decrypt(user.binanceApiSecret) : undefined;
      const privateKey = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : undefined;

      const exchangeArgs: any = {
        apiKey: apiKey,
        enableRateLimit: true,
        options: { defaultType: 'future' }
      };

      if (privateKey) {
        exchangeArgs.secret = privateKey;
      } else if (secret) {
        exchangeArgs.secret = secret;
      }

      const binance = new ccxt.binance(exchangeArgs);
      const balance = await binance.fetchBalance({ type: 'future' });
      const liveBalance = (balance.total as any)['USDT'] || 0;
      
      const lastReport = await db.query.dailyReports.findFirst({
        where: (reports, { eq }) => eq(reports.firebaseUid, user.firebaseUid!),
        orderBy: (reports, { desc }) => [desc(reports.reportDate)]
      });
      
      const startingBalance = lastReport ? parseFloat(lastReport.balance) : liveBalance;
      const netPnlReal = liveBalance - startingBalance;
      
      await db.insert(dailyReports).values({
        firebaseUid: user.firebaseUid!,
        balance: liveBalance.toFixed(2),
        netPnl: netPnlReal.toFixed(2),
      });

      // Si tiene Telegram, le enviamos un reporte básico (puedes expandir esto luego con el texto de señales)
      if (user.chatId) {
        let msg = \`🌙 <b>SNAPSHOT DE CAPITAL REGISTRADO</b> 🌙\\n\\n\`;
        msg += \`💼 <b>Balance Actual (Binance):</b> \\$\${liveBalance.toFixed(2)} USDT\\n\`;
        msg += \`📈 <b>PnL Neto (Últimas 24h):</b> \${netPnlReal >= 0 ? '+' : ''}\\$\${netPnlReal.toFixed(2)} USDT\\n\`;
        await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" });
      }
    } catch (e) {
      console.error(\`Error generando snapshot para \${user.firebaseUid}\`, e);
    }
  }
}`;

content = content.replace(/export async function handler\(\) \{[\s\S]*$/, handlerReplacement);

fs.writeFileSync("src/cron/report.ts", content);
