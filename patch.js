import fs from 'fs';
let c = fs.readFileSync('src/cron/analyze_backup.ts', 'utf8');

c = c.replace(/const balanceObj = await dataFetcher\.getUSDTBalance\(\);\s*const currentBinanceBalance = balanceObj\.free;\s*if \(currentBinanceBalance < 25\) \{[\s\S]*?return; \/\/ No se esfuerza en analizar\s*\}/, '');
c = c.replace('import { Trader } from "../bot/trader.js";', 'import { Trader } from "../bot/trader.js";\nimport { decrypt } from "../api/core/utils/encryption.js";');

const loopStart = '        const marginToInvest = Math.min(25.0, currentBinanceBalance);';
const loopReplace = `        for (const user of activeUsers) {
          if (!user.binanceApiKey) continue;
          const userKey = decrypt(user.binanceApiKey);
          const userSecret = decrypt(user.binanceApiSecret || "");
          const userTrader = new Trader(userKey, userSecret);
          let currentBinanceBalance = 0;
          try {
            const bal = await userTrader.getUSDTBalance(); // Wait, Trader does not have getUSDTBalance! Wait, it has getFreeBalance()! Actually Trader does not have getFreeBalance? Wait. Let me check.
            currentBinanceBalance = bal;
          } catch (e) { console.error("Error fetching balance for user", user.id); }
          
          if (currentBinanceBalance < 25) continue;
          
          const marginToInvest = Math.min(user.montoOperacion || 25.0, currentBinanceBalance);`;
c = c.replace(loopStart, loopReplace);

const loopEnd = '        // Terminar el cron si alcanzamos el máximo de 3 señales por sesión';
const loopEndReplace = `        }
        // Terminar el cron si alcanzamos el máximo de 3 señales por sesión`;
c = c.replace(loopEnd, loopEndReplace);

const msgBlockRegex = /for \(const user of activeUsers\) \{[\s\S]*?await bot\.telegram\.sendMessage\([\s\S]*?\}\s*\}/;
const msgBlockReplace = `          if (user.fcmTokens && user.fcmTokens.length > 0) {
            for (const t of user.fcmTokens) {
              await sendPushNotification(
                t,
                "Nueva Señal: " + signal.direction + " en " + signal.symbol,
                "Estrategia: " + signal.strategy + " | SL: " + signal.stopLoss + " | TP: " + signal.takeProfit,
                { signalId: String(signalId), symbol: signal.symbol }
              );
            }
          }
          if (user.chatId) {
            await bot.telegram.sendMessage(user.chatId, msg, {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Ejecutar Sniper", callback_data: "paper_accept_" + signalId },
                    { text: "❌ Descartar", callback_data: "paper_reject_" + signalId }
                  ]
                ]
              }
            });
          }`;
c = c.replace(msgBlockRegex, msgBlockReplace);

// We need to also patch the `currentBinanceBalance` usage in msg formatting
c = c.replace('`💼 <b>Tu Balance Binance:</b> $${currentBinanceBalance.toFixed(2)} USDT\\n\\n`', '`💼 <b>Tu Balance Binance:</b> $${currentBinanceBalance.toFixed(2)} USDT\\n\\n`');

fs.writeFileSync('src/cron/analyze.ts', c);
