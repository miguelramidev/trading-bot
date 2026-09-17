import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const since = Date.parse("2026-09-17T11:30:00Z");
  
  console.log("=== ETC/USDT (Grid SL: 7.4018) ===");
  const candlesEtc = await exchange.fetchOHLCV('ETC/USDT', '1m', since, 60);
  for (const c of candlesEtc) {
    console.log(`[${new Date(c[0]).toISOString()}] O: ${c[1]} | H: ${c[2]} | L: ${c[3]} | C: ${c[4]}`);
  }
  
  console.log("\n=== BTC/USDT ===");
  const candlesBtc = await exchange.fetchOHLCV('BTC/USDT', '1m', since, 60);
  for (const c of candlesBtc) {
    console.log(`[${new Date(c[0]).toISOString()}] O: ${c[1]} | H: ${c[2]} | L: ${c[3]} | C: ${c[4]}`);
  }
}
run().then(() => process.exit(0));
