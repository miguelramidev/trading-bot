import ccxt from 'ccxt';

async function test() {
  const pkcs8Base64 = "MCowBQYDK2VwAyEAXp+qQJY3pKtvLPTyfbmHmp/faIYwalkNakwY5ddDLLU=";
  const buf = Buffer.from(pkcs8Base64, 'base64');
  const raw32 = buf.subarray(12); // skip 12 byte ASN.1 header
  const rawBase64 = raw32.toString('base64');
  
  console.log("Raw 32-byte secret base64:", rawBase64);
  
  const exchange = new ccxt.binance({
    apiKey: 'dummy',
    secret: rawBase64, // Pass the raw 32-byte base64
    options: { defaultType: 'future' }
  });

  try {
    const req = exchange.sign('api/v3/account', 'api', 'GET', {});
    console.log("Signed successfully!");
  } catch (e) {
    console.error("Error signing:", e.message);
  }
}
test();
