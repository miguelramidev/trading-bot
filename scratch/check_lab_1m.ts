import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  const since = Date.parse("2026-09-16T18:30:00Z");
  
  try {
    const candles = await exchange.fetchOHLCV('LAB/USDT', '1m', since, 60);
    console.log(`\n=== 1m Candles para LAB/USDT desde las 18:30 UTC ===`);
    for (const c of candles) {
      const time = new Date(c[0]).toISOString();
      console.log(`[${time}] O: ${c[1]} | H: ${c[2]} | L: ${c[3]} | C: ${c[4]} | Vol: ${c[5]}`);
    }
  } catch(e) {
    console.log(e.message);
  }
}
run().then(() => process.exit(0));
