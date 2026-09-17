import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const since = Date.now() - (2 * 60 * 60 * 1000);
  const candles = await exchange.fetchOHLCV('BTC/USDT', '15m', since, 10);
  for (const c of candles) {
    if (new Date(c[0]).toISOString() === '2026-09-16T18:00:00.000Z') {
       console.log(`BTC a las 18:00Z - O: ${c[1]}, H: ${c[2]}, L: ${c[3]}, C: ${c[4]}`);
    }
  }
}
run().then(() => process.exit(0));
