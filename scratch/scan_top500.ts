import { DataFetcher } from "../src/bot/data.js";
import { Trader } from "../src/bot/trader.js";

async function getTopNPairs(fetcher: DataFetcher, n: number): Promise<{symbol: string, rank: number}[]> {
  await fetcher.exchange.loadMarkets();
  const tickers = await fetcher.exchange.fetchTickers();
  const usdtPairs = Object.keys(fetcher.exchange.markets)
    .filter(symbol => {
      const market = fetcher.exchange.markets[symbol];
      return market && market.linear && market.active && market.quote === "USDT";
    });

  const pairVolumes: { symbol: string; volumeUsdt: number }[] = [];
  for (const symbol of usdtPairs) {
    const ticker = tickers[symbol];
    if (ticker && ticker.quoteVolume) {
      pairVolumes.push({ symbol, volumeUsdt: ticker.quoteVolume });
    }
  }
  pairVolumes.sort((a, b) => b.volumeUsdt - a.volumeUsdt);
  return pairVolumes.slice(0, n).map((p, index) => ({ symbol: p.symbol, rank: index + 1 }));
}

async function run() {
  const dataFetcher = new DataFetcher();
  const pairsData = await getTopNPairs(dataFetcher, 500);
  
  console.log(`\n======================================================`);
  console.log(`🚀 INICIANDO ESCANEO EXTREMO: TOP 500 MONEDAS 🚀`);
  console.log(`======================================================\n`);

  let btcCloses: number[] = [];
  let bias4h: "UP" | "DOWN" | "FLAT" = "FLAT";
  let macroTrendWarning = "NEUTRAL";
  
  try {
    const btcCandles1D = await dataFetcher.fetchOhlcv('BTC/USDT:USDT', '1d', 200);
    btcCloses = btcCandles1D.map(c => c.close);
    const ema20Arr = dataFetcher.calculateEMA(btcCloses, 20);
    const ema50Arr = dataFetcher.calculateEMA(btcCloses, 50);
    const ema200Arr = dataFetcher.calculateEMA(btcCloses, 200);
    const currentPrice1D = btcCloses[btcCloses.length - 1];
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const ema200 = ema200Arr[ema200Arr.length - 1];

    if (currentPrice1D > ema200 && ema20 > ema50) {
      macroTrendWarning = "ALCISTA";
    } else if (currentPrice1D < ema200 && ema20 < ema50) {
      macroTrendWarning = "BAJISTA";
    }
    bias4h = await dataFetcher.getBtcTrend("4h");
    console.log(`👑 BTC Macro 1D: ${macroTrendWarning} | Sesgo 4H: ${bias4h}\n`);
  } catch(e) {
    console.log(`Error obteniendo BTC data:`, e);
  }

  let signalsFound = 0;

  // Barra de progreso manual
  for (let i = 0; i < pairsData.length; i++) {
    const { symbol, rank } = pairsData[i];
    process.stdout.write(`Escaneando ${rank}/500: ${symbol}...\r`);
    
    try {
      const candles15m = await dataFetcher.fetchOhlcv(symbol, "15m", 250);
      const candles4h = await dataFetcher.fetchOhlcv(symbol, "4h", 250);
      
      if (candles15m.length < 200 || candles4h.length < 50) continue;

      const closes15m = candles15m.map(c => c.close);
      const highs15m = candles15m.map(c => c.high);
      const lows15m = candles15m.map(c => c.low);
      const volumes15m = candles15m.map(c => c.volume);
      const closes4h = candles4h.map(c => c.close);

      const ema200 = dataFetcher.calculateEMA(closes15m, 200);
      const ema21 = dataFetcher.calculateEMA(closes15m, 21);
      const bb = dataFetcher.calculateBollingerBands(closes15m, 20, 2);
      const rsi14 = dataFetcher.calculateRSI(closes15m, 14);
      let adxResult;
      try { adxResult = dataFetcher.calculateADX(candles15m, 14); } catch(e) { continue; }
      const adx = adxResult.adx;
      const atr14 = dataFetcher.calculateATR(candles15m, 14);
      const smaVol20 = dataFetcher.calculateSMA(volumes15m, 20);

      const ema50_4h = dataFetcher.calculateEMA(closes4h, 50);

      const currentPrice = closes15m[closes15m.length - 1];
      const currentEma4h = ema50_4h[ema50_4h.length - 1];
      const currentAdx = adx[adx.length - 1];
      const currentEma200 = ema200[ema200.length - 1];
      const currentEma21 = ema21[ema21.length - 1];
      const currentAtr = atr14[atr14.length - 1];
      const currentVol = volumes15m[volumes15m.length - 1];
      const avgVol = smaVol20[smaVol20.length - 1];

      const currentCandle = candles15m[candles15m.length - 1];
      const prevCandle = candles15m[candles15m.length - 2];
      const isGreen = currentCandle.close > currentCandle.open;
      const isRed = currentCandle.close < currentCandle.open;

      let signal: any = null;

      if (currentAdx > 25) {
        if (currentPrice > currentEma200 && bias4h === "UP") {
          const touchedEma = currentCandle.low <= currentEma21 * 1.005;
          const heldEma = currentCandle.close >= currentEma21 * 0.998;
          if (touchedEma && heldEma && isGreen) {
            if (currentVol > avgVol && prevCandle.volume < avgVol) {
              signal = { strategy: "1", direction: "LONG", regime: "Tendencial", reason: "Rebote EMA 21" };
            }
          }
        } else if (currentPrice < currentEma200 && bias4h === "DOWN") {
          const touchedEma = currentCandle.high >= currentEma21 * 0.995;
          const heldEma = currentCandle.close <= currentEma21 * 1.002;
          if (touchedEma && heldEma && isRed) {
             if (prevCandle.volume < avgVol) {
               signal = { strategy: "1", direction: "SHORT", regime: "Tendencial", reason: "Rechazo EMA 21" };
             }
          }
        }
      } else if (currentAdx < 20) {
        const currentLowerBB = bb.lower[bb.lower.length - 1];
        const currentUpperBB = bb.upper[bb.upper.length - 1];
        const currentRsi = rsi14[rsi14.length - 1];

        if (candles15m[candles15m.length - 1].low <= currentLowerBB && currentRsi < 30) {
          if (currentVol <= avgVol) {
            signal = { strategy: "2", direction: "LONG", regime: "Rango", reason: "Banda Inferior + RSI" };
          }
        } else if (candles15m[candles15m.length - 1].high >= currentUpperBB && currentRsi > 70) {
          if (currentVol <= avgVol) {
            signal = { strategy: "2", direction: "SHORT", regime: "Rango", reason: "Banda Superior + RSI" };
          }
        }
      }

      if (signal) {
        let btcCorrVal = 0;
        if (!symbol.includes("BTC") && btcCloses.length > 0) {
           btcCorrVal = dataFetcher.calculateCorrelation(closes15m, btcCloses);
        }

        if (macroTrendWarning === "ALCISTA" && signal.direction === "SHORT" && bias4h === "UP" && btcCorrVal >= 0) {
           signal.direction = "LONG";
           signal.strategy = "3";
           signal.regime = "Macro Breakout";
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "LONG" && bias4h === "DOWN" && btcCorrVal >= 0) {
           signal.direction = "SHORT";
           signal.strategy = "3";
           signal.regime = "Macro Breakout";
        }

        const frHistory = await dataFetcher.fetchFundingRateHistory(symbol, 1);
        let frVal = 0;
        if (frHistory && frHistory.length > 0) {
            frVal = frHistory[0].fundingRate;
        }

        if (frVal !== 0) {
           if (signal.direction === "LONG" && frVal > 0) {
              signal.direction = "SHORT";
              signal.strategy = "4";
              signal.regime = "Liquidity Hunter";
           } else if (signal.direction === "SHORT" && frVal < 0) {
              signal.direction = "LONG";
              signal.strategy = "4";
              signal.regime = "Liquidity Hunter";
           }
        }

        signalsFound++;
        console.log(`\n\n🚨 [SEÑAL #${signalsFound}] ${symbol} (Rank #${rank}) 🚨`);
        console.log(`📈 Dirección: ${signal.direction}`);
        console.log(`📏 Estrategia: ${signal.regime} (Est. ${signal.strategy})`);
        console.log(`💰 Funding Rate: ${frVal}`);
        console.log(`📊 ADX: ${currentAdx.toFixed(2)} | RSI: ${rsi14[rsi14.length-1].toFixed(2)}`);
      }

    } catch(e) { }
  }

  console.log(`\n\n======================================================`);
  console.log(`✅ ESCANEO COMPLETADO`);
  console.log(`Total monedas escaneadas: 500`);
  console.log(`Total señales encontradas: ${signalsFound}`);
  console.log(`======================================================\n`);
}

run().then(() => process.exit(0));
