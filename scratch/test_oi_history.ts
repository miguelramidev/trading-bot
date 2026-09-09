import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  try {
    const symbol = "BTC/USDT:USDT";
    if (exchange.has['fetchOpenInterestHistory']) {
      const oih = await exchange.fetchOpenInterestHistory(symbol, '4h', undefined, 2);
      console.log("OI History 4h:", oih);
    } else {
      console.log("fetchOpenInterestHistory not supported");
    }
  } catch (e) {
    console.error(e);
  }
}
run().then(() => process.exit(0));
