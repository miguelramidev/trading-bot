import fs from 'fs';
let content = fs.readFileSync('src/cron/analyze.ts', 'utf8');
const start = content.indexOf('const balanceObj = await dataFetcher.getUSDTBalance();');
const endStr = 'return; // No se esfuerza en analizar\n  }';
const end = content.indexOf(endStr, start) + endStr.length;
if(start > -1 && end > start) {
  content = content.substring(0, start) + content.substring(end);
}
fs.writeFileSync('src/cron/analyze.ts', content);
