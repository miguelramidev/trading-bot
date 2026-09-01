import ccxt from 'ccxt';

async function test() {
  const secretKeyNode = "-----BEGIN PRIVATE KEY-----\nMCowBQYDK2VwAyEAXp+qQJY3pKtvLPTyfbmHmp/faIYwalkNakwY5ddDLLU=\n-----END PRIVATE KEY-----";
  
  // Extraer base64
  const b64 = secretKeyNode.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  
  // El seed de 32 bytes está al final
  const seed = buf.subarray(buf.length - 32);
  
  // Construir el PEM con el header de 16 bytes que espera CCXT
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const newBuf = Buffer.concat([header, seed]);
  const newB64 = newBuf.toString('base64');
  const newPem = `-----BEGIN PRIVATE KEY-----\n${newB64}\n-----END PRIVATE KEY-----`;
  
  console.log("Nuevo PEM para CCXT:\n" + newPem);
  
  const exchange = new ccxt.binance({
    apiKey: 'dummy',
    secret: newPem,
    options: { defaultType: 'future' }
  });

  try {
    const req = exchange.sign('fapi/v1/account', 'private', 'GET', {});
    console.log("Signed successfully with CCXT compatible PEM!");
  } catch (e) {
    console.error("Error signing:", e.message);
  }
}
test();
