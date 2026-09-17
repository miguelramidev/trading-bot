import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const since = Date.parse("2026-09-17T00:00:00Z");
  const candles = await exchange.fetchOHLCV('AVAX/USDT', '15m', since, 30);
  for (const c of candles) {
    const time = new Date(c[0]).toISOString();
    console.log(`[${time}] O: ${c[1]} | H: ${c[2]} | L: ${c[3]} | C: ${c[4]}`);
  }
}
run().then(() => process.exit(0));
