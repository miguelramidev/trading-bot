import fs from 'fs';
let content = fs.readFileSync('src/cron/analyze.ts', 'utf8');
content = content.replace('import { Trader } from \
../bot/trader.js\;', 'import { Trader } from \../bot/trader.js\;\\nimport { decrypt } from \../core/utils/encryption.js\;');
content = content.replace(/const balanceObj = await dataFetcher.getUSDTBalance\\(\\)[\s\S]*?return; \/\/ No se esfuerza en analizar\r?\n\s*\}/m, '');
fs.writeFileSync('src/cron/analyze.ts', content);
