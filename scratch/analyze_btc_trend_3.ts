import ccxt from "ccxt";

function calcEMA(closes: number[], period: number) {
  if (closes.length === 0) return 0;
  const k = 2 / (period + 1);
  let emaArr = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    emaArr.push(closes[i] * k + emaArr[i - 1] * (1 - k));
  }
  return emaArr[emaArr.length - 1];
}

async function run() {
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const timeframes = ['15m', '1h', '4h', '1d'];
  
  console.log("=== ANÁLISIS MACRO DE BITCOIN (BTC) ===\n");
  
  for (const tf of timeframes) {
    try {
      const candles = await exchange.fetchOHLCV('BTC/USDT', tf, undefined, 250);
      if (!candles || candles.length === 0) continue;
      const closes = candles.map(c => c[4] as number); // c[4] is close
      const currentPrice = closes[closes.length - 1];
      
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50);
      const ema200 = calcEMA(closes, 200);
      
      console.log(`[Marco: ${tf}] Precio: $${currentPrice.toFixed(0)}`);
      console.log(`EMA 20: $${ema20.toFixed(0)} | EMA 50: $${ema50.toFixed(0)} | EMA 200: $${ema200.toFixed(0)}`);
      
      if (currentPrice > ema200 && ema20 > ema50) {
        const dist = ((currentPrice - ema200) / ema200 * 100).toFixed(2);
        console.log(`Veredicto: 🟢 ALCISTA (Precio por encima de EMA200 por ${dist}%)`);
      } else if (currentPrice < ema200 && ema20 < ema50) {
        console.log(`Veredicto: 🔴 BAJISTA`);
      } else {
        console.log(`Veredicto: 🟡 TRANSICIÓN / RANGO`);
      }
      console.log("-----------------------------------------");
    } catch(e) {
      console.log(e.message);
    }
  }
}
run().then(() => process.exit(0));
