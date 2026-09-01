import ccxt from 'ccxt';

async function test() {
  const publicExchange = new ccxt.binance({
    enableRateLimit: true,
    options: { defaultType: 'future' }
  });
  
  const symbol = 'BTC/USDT:USDT';
  console.log(`Buscando OB para ${symbol}...`);
  const ticker = await publicExchange.fetchTicker(symbol);
  const currentPrice = ticker.last;
  if (!currentPrice) return;
  
  const ob = await publicExchange.fetchOrderBook(symbol, 500);
  
  const lowerBound = currentPrice * 0.99;
  const upperBound = currentPrice * 1.01;
  
  let bidVol = 0;
  let askVol = 0;
  
  for (const [price, amount] of ob.bids) {
    if (price >= lowerBound) bidVol += amount * price;
  }
  for (const [price, amount] of ob.asks) {
    if (price <= upperBound) askVol += amount * price;
  }
  
  console.log(`Price: ${currentPrice}`);
  console.log(`Bid Vol (Soporte): $${bidVol.toFixed(2)}`);
  console.log(`Ask Vol (Resistencia): $${askVol.toFixed(2)}`);
  
  if (askVol > bidVol * 1.5) console.log(`⚠️ Peligro: Muralla Vendedora (${(askVol/bidVol).toFixed(1)}x)`);
  else if (bidVol > askVol * 1.5) console.log(`⚠️ Peligro: Muralla Compradora (${(bidVol/askVol).toFixed(1)}x)`);
  else console.log(`Normal / Equilibrado`);
}

test();
