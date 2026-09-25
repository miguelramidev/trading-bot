import fs from 'fs';
let c = fs.readFileSync('src/cron/analyze_backup.ts', 'utf8');
// Remove global balance check
c = c.replace(/const balanceObj = await dataFetcher\.getUSDTBalance\(\);\s*const currentBinanceBalance = balanceObj\.free;\s*if \(currentBinanceBalance < 25\) \{[\s\S]*?return; \/\/ No se esfuerza en analizar\s*\}/, '');
// Add decrypt import
c = c.replace('import { Trader } from \
../bot/trader.js\;', 'import { Trader } from \../bot/trader.js\;\\nimport { decrypt } from \../core/utils/encryption.js\;');
// Fix the loop at the end
const loopStart = '        const marginToInvest = Math.min(25.0, currentBinanceBalance);';
const loopReplace = \        for (const user of activeUsers) {\\n          if (!user.binanceApiKey) continue;\\n          const userKey = decrypt(user.binanceApiKey);\\n          const userSecret = decrypt(user.binanceApiSecret || '');\\n          const userTrader = new Trader(userKey, userSecret);\\n          let currentBinanceBalance = 0;\\n          try { currentBinanceBalance = (await userTrader.getUSDTBalance()).free; } catch(e){}\\n          if (currentBinanceBalance < 25) continue;\\n          const marginToInvest = Math.min(user.montoOperacion || 25.0, currentBinanceBalance);\;
c = c.replace(loopStart, loopReplace);
// Add getUSDTBalance to Trader
// Wait, getUSDTBalance is on DataFetcher, I should add it to Trader
fs.writeFileSync('src/cron/analyze.ts', c);
