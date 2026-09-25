import { Trader } from './bot/trader.js';
async function main() {
  try {
    const t = new Trader();
    const bal = await t.getFreeBalance();
    console.log('Balance global:', bal);
  } catch(e) { console.error('Error:', e); }
  process.exit(0);
}
main();
