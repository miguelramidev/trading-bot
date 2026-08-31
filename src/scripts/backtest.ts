import { DataFetcher } from "../bot/data.js";
import { PullbackStrategy } from "../bot/strategy.js";
import { MomentumStrategy } from "../bot/momentum.js";

async function runBacktest(symbol: string, timeframe: string) {
  console.log(`\n===========================================`);
  console.log(`🚀 INICIANDO BACKTEST: ${symbol} (${timeframe})`);
  console.log(`===========================================\n`);

  const fetcher = new DataFetcher();
  const pullback = new PullbackStrategy();
  const momentum = new MomentumStrategy();

  // Fetch as much history as possible (e.g. 1500 candles)
  const allLtfCandles = await fetcher.fetchOhlcv(symbol, timeframe, 1500);
  const htf = pullback.getHigherTimeframe(timeframe);
  const allHtfCandles = await fetcher.fetchOhlcv(symbol, htf, 1500);

  if (!allLtfCandles || !allHtfCandles || allLtfCandles.length < 500 || allHtfCandles.length < 50) {
    console.error("No hay suficientes datos históricos para backtesting.");
    process.exit(1);
  }

  console.log(`Datos descargados: ${allLtfCandles.length} velas LTF (${timeframe}), ${allHtfCandles.length} velas HTF (${htf}).`);

  let totalSignals = 0;
  let filledSignals = 0;
  let wins = 0;
  let losses = 0;
  let expired = 0;
  let activeTrades = [];

  const BATCH_SIZE = 50; // Para calcular trend macro con cierta holgura
  const MIN_CANDLES_REQUIRED = 200; // Lo que necesitan las estrategias (EMA 200)

  // Recorrer el tiempo vela a vela
  for (let i = MIN_CANDLES_REQUIRED; i < allLtfCandles.length; i++) {
    const currentCandle = allLtfCandles[i];
    
    // 1. GESTIONAR TRADES ACTIVOS (Fills, SL, TP)
    for (let t = activeTrades.length - 1; t >= 0; t--) {
      const trade = activeTrades[t];
      
      // Si la orden límite aún no ha sido llenada (Entry pending)
      if (!trade.isFilled) {
        trade.candlesSinceSignal++;
        
        // Comprobar si tocó la entrada en esta vela
        const hitLongEntry = trade.direction === "LONG" && currentCandle.low <= trade.entry && currentCandle.high >= trade.entry;
        const hitShortEntry = trade.direction === "SHORT" && currentCandle.high >= trade.entry && currentCandle.low <= trade.entry;
        
        if (hitLongEntry || hitShortEntry) {
          trade.isFilled = true;
          filledSignals++;
          console.log(`[${new Date(currentCandle.timestamp).toISOString()}] 🟢 ORDEN LLENADA: ${trade.strategyName} ${trade.direction} en ${trade.entry}`);
        } else if (trade.candlesSinceSignal >= trade.expirationCandles) {
          // Expiró sin llenarse
          console.log(`[${new Date(currentCandle.timestamp).toISOString()}] ⌛ EXPIRADA (No retest): ${trade.strategyName} ${trade.direction}`);
          expired++;
          activeTrades.splice(t, 1);
          continue;
        }
      }
      
      // Si ya está llenada, comprobar TP o SL
      if (trade.isFilled) {
        let hitTP = false;
        let hitSL = false;

        if (trade.direction === "LONG") {
          if (currentCandle.low <= trade.stopLoss) hitSL = true;
          if (currentCandle.high >= trade.takeProfit) hitTP = true;
        } else {
          if (currentCandle.high >= trade.stopLoss) hitSL = true;
          if (currentCandle.low <= trade.takeProfit) hitTP = true;
        }

        // Si tocó ambos en la misma vela, asumimos SL por ser pesimistas/conservadores en el backtest
        if (hitSL) {
          console.log(`[${new Date(currentCandle.timestamp).toISOString()}] ❌ STOP LOSS (-1R): ${trade.strategyName}`);
          losses++;
          activeTrades.splice(t, 1);
        } else if (hitTP) {
          console.log(`[${new Date(currentCandle.timestamp).toISOString()}] 🏆 TAKE PROFIT (+3R): ${trade.strategyName}`);
          wins++;
          activeTrades.splice(t, 1);
        }
      }
    }

    // 2. BUSCAR NUEVAS SEÑALES
    // Solo buscamos señales si no hay trades activos (para evitar doble exposición)
    if (activeTrades.length > 0) continue;

    const slicedLtf = allLtfCandles.slice(0, i + 1);
    const slicedHtf = allHtfCandles.filter(c => c.timestamp <= currentCandle.timestamp);

    // Mock del btcTrend (En un entorno real requiere iterar BTC, aquí simplificamos a "UP" si el precio está por encima de su apertura de hace 50 periodos como proxy para no saturar APIs)
    const btcCandleNow = slicedLtf[slicedLtf.length - 1];
    const btcCandlePast = slicedLtf[slicedLtf.length - Math.min(slicedLtf.length, 50)];
    const mockBtcTrend = btcCandleNow.close > btcCandlePast.close ? "UP" : "DOWN";

    const pullSignal = pullback.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);
    const momSignal = momentum.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);

    let bestSignal = null;
    if (pullSignal && momSignal) bestSignal = pullSignal.score > momSignal.score ? pullSignal : momSignal;
    else bestSignal = pullSignal || momSignal;

    if (bestSignal) {
      totalSignals++;
      console.log(`\n[${new Date(currentCandle.timestamp).toISOString()}] 🚨 SEÑAL DETECTADA: ${bestSignal.strategyName} ${bestSignal.direction}`);
      console.log(`  Entry: ${bestSignal.entry.toFixed(4)}, SL: ${bestSignal.stopLoss.toFixed(4)}, TP: ${bestSignal.takeProfit.toFixed(4)}`);
      
      activeTrades.push({
        ...bestSignal,
        isFilled: false,
        candlesSinceSignal: 0,
      });
      
      // Saltar velas para no generar la misma señal 5 veces seguidas
      i += 5;
    }
  }

  // REPORTE FINAL
  console.log(`\n===========================================`);
  console.log(`📊 REPORTE DE BACKTESTING`);
  console.log(`===========================================`);
  console.log(`Total Señales Emitidas: ${totalSignals}`);
  console.log(`Señales Expiradas (No Retest): ${expired}`);
  console.log(`Órdenes Ejecutadas (Fills): ${filledSignals}`);
  console.log(`-------------------------------------------`);
  console.log(`Victorias (TP): ${wins}`);
  console.log(`Derrotas (SL): ${losses}`);
  
  const totalCompleted = wins + losses;
  const winrate = totalCompleted > 0 ? ((wins / totalCompleted) * 100).toFixed(2) : 0;
  console.log(`Winrate: ${winrate}%`);
  
  // Riesgo/Recompensa es 1:3
  const pnlR = (wins * 3) - losses;
  console.log(`Rentabilidad Neta (R): ${pnlR > 0 ? "+" : ""}${pnlR}R`);
  console.log(`===========================================\n`);
}

const symbolArg = process.argv[2];
const tfArg = process.argv[3];

if (!symbolArg || !tfArg) {
  console.error("Uso: npm run backtest <SYMBOL> <TIMEFRAME> (ej. npm run backtest NEAR/USDT 15m)");
  process.exit(1);
}

runBacktest(symbolArg, tfArg).catch(console.error);
