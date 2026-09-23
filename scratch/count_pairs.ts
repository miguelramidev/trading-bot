import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const fetcher = new DataFetcher();
  await fetcher.exchange.loadMarkets();
  const markets = Object.values(fetcher.exchange.markets);
  const linearMarkets = markets.filter(m => m.linear && m.active && m.quote === 'USDT');
  console.log(`Total active USDT-M linear futures pairs: ${linearMarkets.length}`);
}
run();
