import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  // Look at the last 8 hours (32 15m candles)
  const since = Date.now() - (8 * 60 * 60 * 1000);
  
  for (const symbol of ['HYPE/USDT', 'BNB/USDT']) {
    try {
      const candles = await exchange.fetchOHLCV(symbol, '15m', since, 50);
      console.log(`\n=== Análisis de ${symbol} ===`);
      
      let maxWickPct = 0;
      let worstCandle = null;
      
      for (const c of candles) {
        const [timestamp, open, high, low, close, volume] = c;
        const bodySize = Math.abs(open - close);
        
        // Wick analysis
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;
        
        const upperWickPct = (upperWick / open) * 100;
        const lowerWickPct = (lowerWick / open) * 100;
        
        if (upperWickPct > maxWickPct) { maxWickPct = upperWickPct; worstCandle = { type: 'UP', time: new Date(timestamp).toISOString(), pct: upperWickPct, high, low }; }
        if (lowerWickPct > maxWickPct) { maxWickPct = lowerWickPct; worstCandle = { type: 'DOWN', time: new Date(timestamp).toISOString(), pct: lowerWickPct, high, low }; }
      }
      
      if (worstCandle) {
        console.log(`Mayor machetazo: ${worstCandle.pct.toFixed(2)}% hacia ${worstCandle.type === 'UP' ? 'ARRIBA' : 'ABAJO'} a las ${worstCandle.time}`);
        console.log(`High: ${worstCandle.high}, Low: ${worstCandle.low}`);
      }
    } catch(e) {
      console.log(`Error fetching ${symbol}: ${e.message}`);
    }
  }
}
run().then(() => process.exit(0));
