import ccxt from 'ccxt';
import fs from 'fs';

async function test() {
  try {
    const privKey = fs.readFileSync('binance_private_key.pem', 'utf8');
    const exchange = new ccxt.binance({
      apiKey: 'dummy',
      secret: privKey, // pass the raw PEM string
      options: { defaultType: 'future' }
    });

    // Check if ccxt parses it correctly
    console.log("CCXT instantiated.");
    // Force signing a request to trigger ed25519 logic
    const req = exchange.sign('api/v3/account', 'api', 'GET', {});
    console.log("Sign success!", req);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();
