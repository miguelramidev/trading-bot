import ccxt from 'ccxt';

async function test() {
  const badKey = Buffer.alloc(28).toString('base64');
  const exchange = new ccxt.binance({
    apiKey: 'dummy',
    secret: badKey,
    options: { defaultType: 'future' }
  });

  try {
    const req = exchange.sign('fapi/v1/account', 'private', 'GET', {});
    console.log("Signed successfully!");
  } catch (e) {
    console.error("Error signing:", e.message);
  }
}
test();
