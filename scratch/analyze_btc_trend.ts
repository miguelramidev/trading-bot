import ccxt from "ccxt";
import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const fetcher = new DataFetcher();
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  
  const timeframes = ['15m', '1h', '4h', '1d'];
  
  for (const tf of timeframes) {
    const candles = await exchange.fetchOHLCV('BTC/USDT', tf, undefined, 250);
    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    
    // EMA
    const { ema: ema20Arr } = fetcher.calculateEMA(closes, 20);
    const { ema: ema50Arr } = fetcher.calculateEMA(closes, 50);
    const { ema: ema200Arr } = fetcher.calculateEMA(closes, 200);
    
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const ema200 = ema200Arr[ema200Arr.length - 1];
    
    // ADX
    const { adx: adxArr, plusDI, minusDI } = fetcher.calculateADX(candles, 14);
    const adx = adxArr[adxArr.length - 1];
    const pdi = plusDI[plusDI.length - 1];
    const mdi = minusDI[minusDI.length - 1];
    
    console.log(`\n=== Marco Temporal: ${tf} ===`);
    console.log(`Precio Actual: ${currentPrice}`);
    console.log(`EMA 20: ${ema20.toFixed(2)} | EMA 50: ${ema50.toFixed(2)} | EMA 200: ${ema200.toFixed(2)}`);
    
    let trend = "RANGO";
    if (adx > 25) {
      trend = pdi > mdi ? "ALCISTA FUERTE" : "BAJISTA FUERTE";
    } else {
      trend = pdi > mdi ? "ALCISTA DEBIL" : "BAJISTA DEBIL";
    }
    console.log(`ADX: ${adx.toFixed(2)} (Fuerza) | +DI: ${pdi.toFixed(2)} | -DI: ${mdi.toFixed(2)}`);
    console.log(`Veredicto ADX: ${trend}`);
    
    if (currentPrice > ema200 && ema20 > ema50) {
      console.log(`Veredicto EMA: TENDENCIA ALCISTA (Precio > EMA200 y EMA20 > EMA50)`);
    } else if (currentPrice < ema200 && ema20 < ema50) {
      console.log(`Veredicto EMA: TENDENCIA BAJISTA (Precio < EMA200 y EMA20 < EMA50)`);
    } else {
      console.log(`Veredicto EMA: TRANSICIÓN / RANGO`);
    }
  }
}
run().then(() => process.exit(0));
