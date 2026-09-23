import { DataFetcher } from "../src/bot/data.js";

async function run() {
  const fetcher = new DataFetcher();
  const pairs = await fetcher.getTop100Pairs();
  const topPairs = pairs.slice(0, 30); 

  let wins = 0;
  let losses = 0;

  for (const pair of topPairs) {
    const symbol = pair.symbol;
    try {
        const candles = await fetcher.fetchOhlcv(symbol, "15m", 500); 
        if (candles.length < 250) continue;

        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);

        const ema200 = fetcher.calculateEMA(closes, 200);
        const ema21 = fetcher.calculateEMA(closes, 21);
        const ema9 = fetcher.calculateEMA(closes, 9);
        const atr = fetcher.calculateATR(candles, 14);
        const smaVol = fetcher.calculateSMA(volumes, 20);
        
        let adxData;
        try { adxData = fetcher.calculateADX(candles, 14); } catch(e) { continue; }
        const adx = adxData.adx;

        for (let i = 250; i < candles.length - 1; i++) {
           const currentCandle = candles[i];
           const prevCandle = candles[i-1];
           
           const currentAdx = adx[i];
           const currentEma200 = ema200[i];
           const currentEma21 = ema21[i];
           const currentEma9 = ema9[i];
           const currentAtr = atr[i];
           const currentVol = volumes[i];
           const avgVol = smaVol[i];
           const prevVol = volumes[i-1];

           const isGreen = currentCandle.close > currentCandle.open;
           const isRed = currentCandle.close < currentCandle.open;

           if (currentAdx < 35) continue;

           let originalSignal = null;

           if (currentCandle.close > currentEma200 && currentEma9 > currentEma21) {
              const distToEma21 = (currentCandle.close - currentEma21) / currentEma21;
              if (distToEma21 > 0.005) { 
                 const touchedEma9 = currentCandle.low <= currentEma9 * 1.002;
                 const heldEma9 = currentCandle.close >= currentEma9 * 0.998;
                 
                 if (touchedEma9 && heldEma9 && isGreen) {
                    if (currentVol > avgVol && prevVol < avgVol) {
                       originalSignal = "LONG";
                    }
                 }
              }
           }
           else if (currentCandle.close < currentEma200 && currentEma9 < currentEma21) {
              const distToEma21 = (currentEma21 - currentCandle.close) / currentEma21;
              if (distToEma21 > 0.005) { 
                 const touchedEma9 = currentCandle.high >= currentEma9 * 0.998;
                 const heldEma9 = currentCandle.close <= currentEma9 * 1.002;
                 
                 if (touchedEma9 && heldEma9 && isRed) {
                    if (currentVol > avgVol && prevVol < avgVol) {
                       originalSignal = "SHORT";
                    }
                 }
              }
           }

           if (originalSignal) {
              // INVERTIMOS LA SEÑAL (Cazando el agotamiento)
              const invertedSignal = originalSignal === "LONG" ? "SHORT" : "LONG";

              const entry = currentCandle.close;
              let sl = invertedSignal === "LONG" ? entry - (1.0 * currentAtr) : entry + (1.0 * currentAtr);
              let tp = invertedSignal === "LONG" ? entry + (2.0 * currentAtr) : entry - (2.0 * currentAtr);

              let result = "PENDING";
              for (let j = i + 1; j < candles.length; j++) {
                 const future = candles[j];
                 if (invertedSignal === "LONG") {
                    if (future.low <= sl) { result = "LOSS"; break; }
                    if (future.high >= tp) { result = "WIN"; break; }
                 } else {
                    if (future.high >= sl) { result = "LOSS"; break; }
                    if (future.low <= tp) { result = "WIN"; break; }
                 }
              }
              
              if (result === "WIN") wins++;
              if (result === "LOSS") losses++;
           }
        }
    } catch(e) { }
  }
  const total = wins + losses;
  console.log(`\n=== ESTRATEGIA 5 INVERTIDA (Cazador de Agotamiento EMA 9) ===`);
  console.log(`Operaciones Simuladas (Últimos 5 días): ${total}`);
  if (total > 0) {
      console.log(`WIN RATE: ${((wins/total)*100).toFixed(2)}% (${wins} Victorias / ${losses} Derrotas)`);
  }
}
run().then(() => process.exit(0));
