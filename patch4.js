import fs from 'fs';
let c = fs.readFileSync('src/cron/analyze_backup.ts', 'utf8');

// 1. Remove global balance
c = c.replace(/const balanceObj = await dataFetcher\.getUSDTBalance\(\);\s*const currentBinanceBalance = balanceObj\.free;\s*if \(currentBinanceBalance < 25\) \{[\s\S]*?return; \/\/ No se esfuerza en analizar\s*\}/, '');

// 2. Add decrypt import
c = c.replace('import { Trader } from \
../bot/trader.js\;', 'import { Trader } from \../bot/trader.js\;\\nimport { decrypt } from \../core/utils/encryption.js\;');

// 3. Replace the message sending with the user loop
const loopStart = 'const marginToInvest = Math.min(25.0, currentBinanceBalance);';
const loopReplace = \`n        for (const user of activeUsers) {
          if (!user.binanceApiKey) continue;
          const userKey = decrypt(user.binanceApiKey);
          const userSecret = decrypt(user.binanceApiSecret || '');
          const userTrader = new Trader(userKey, userSecret);
          let currentBinanceBalance = 0;
          try {
            const bal = await userTrader.getFreeBalance();
            currentBinanceBalance = bal;
          } catch (e) { console.error('Error fetching balance for user', user.id); }
          
          if (currentBinanceBalance < 25) continue;
          
          const marginToInvest = Math.min(user.montoOperacion || 25.0, currentBinanceBalance);\;

c = c.replace(loopStart, loopReplace);

// 4. Close the loop after sending telegram/push
const loopEnd = '        // Terminar el cron si alcanzamos el máximo de 3 señales por sesión';
const loopEndReplace = \`n        }
        // Terminar el cron si alcanzamos el máximo de 3 señales por sesión\;

c = c.replace(loopEnd, loopEndReplace);

fs.writeFileSync('src/cron/analyze.ts', c);
