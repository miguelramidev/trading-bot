import { DataFetcher } from "../bot/data.js";
import { PullbackStrategy } from "../bot/strategy.js";
import { MomentumStrategy } from "../bot/momentum.js";

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function runPortfolioSimulation() {
  console.log(`\n===========================================`);
  console.log(`🌍 INICIANDO SIMULACIÓN GLOBAL DE PORTAFOLIO`);
  console.log(`===========================================\n`);

  const fetcher = new DataFetcher();
  console.log(`Consultando el Top 100 de monedas por volumen en Binance...`);
  const symbols = await fetcher.getTop100Pairs();
  console.log(`Se obtuvieron ${symbols.length} monedas. Procesando historiales...`);
  const timeframe = "1h";
  const htf = "4h";

  const MAKER_FEE = 0.0002;
  const TAKER_FEE = 0.0005;

  let balance = 25.0; 
  const MIN_BALANCE = 20.0;
  const RESERVE = 5.0;

  const pullback = new PullbackStrategy(1.0, 2.0);
  const momentum = new MomentumStrategy(1.0, 2.0);

  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const endTime = Date.now();
  const startTime = endTime - ONE_MONTH_MS;

  console.log(`Descargando historial de ${symbols.length} monedas...`);
  const marketData: Record<string, { ltf: Candle[], htf: Candle[] }> = {};

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    process.stdout.write(`\rDescargando data [${i + 1}/${symbols.length}]: ${sym} ...`);
    try {
      const ltf = await fetcher.fetchOhlcv(sym, timeframe, 1500);
      const htfData = await fetcher.fetchOhlcv(sym, htf, 1500);
      if (ltf && htfData) {
        marketData[sym] = { ltf, htf: htfData };
      }
      // Pequeño delay para no romper el Rate Limit de Binance
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      // Ignorar errores puntuales de un par
    }
  }
  process.stdout.write(`\n`);

  console.log(`Historial descargado con éxito.\n`);
  console.log(`Condiciones:`);
  console.log(`- Monedas: ${symbols.join(", ")}`);
  console.log(`- Capital Inicial: $25.00`);
  console.log(`- Tamaño de Posición: Balance - $5.00 (Mínimo requerido)`);
  console.log(`- Regla de Ruina: Si el balance cae a $20.00, el bot se apaga.\n`);

  let activeTrade: any = null;
  let totalTrades = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let totalFeesPaid = 0;
  // Extraer todos los timestamps únicos
  const allTimestamps = new Set<number>();
  for (const sym of symbols) {
    if (marketData[sym]) {
      marketData[sym].ltf.forEach(c => {
        if (c.timestamp >= startTime && c.timestamp <= endTime) {
          allTimestamps.add(c.timestamp);
        }
      });
    }
  }
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  // Generamos una línea de tiempo real basada en las velas
  for (const time of sortedTimestamps) {
    
    // Si caemos en bancarrota según las reglas del usuario
    if (balance <= MIN_BALANCE) {
      console.log(`\n💀 BANCARROTA ALCANZADA: El balance bajó a $${balance.toFixed(2)} (Límite: $20.00). El bot fue liquidado.\n`);
      break;
    }

    // 1. GESTIONAR TRADE ACTIVO
    if (activeTrade) {
      const symData = marketData[activeTrade.symbol].ltf;
      const currentCandle = symData.find(c => c.timestamp === time);
      
      if (!currentCandle) continue;

      if (!activeTrade.isFilled) {
        activeTrade.candlesSinceSignal++;
        const hitLongEntry = activeTrade.direction === "LONG" && currentCandle.low <= activeTrade.entry && currentCandle.high >= activeTrade.entry;
        const hitShortEntry = activeTrade.direction === "SHORT" && currentCandle.high >= activeTrade.entry && currentCandle.low <= activeTrade.entry;
        
        if (hitLongEntry || hitShortEntry) {
          activeTrade.isFilled = true;
          // Cobramos Maker Fee
          const positionSize = balance - RESERVE;
          const fee = positionSize * MAKER_FEE;
          balance -= fee;
          totalFeesPaid += fee;
          console.log(`[${new Date(time).toISOString()}] 🟢 ENTRADA ${activeTrade.direction} en ${activeTrade.symbol}. Balance: $${balance.toFixed(2)}`);
        } else if (activeTrade.candlesSinceSignal >= activeTrade.expirationCandles) {
          activeTrade = null; // Expiró
        }
      }

      if (activeTrade && activeTrade.isFilled) {
        let hitTP = false;
        let hitSL = false;
        let hitBreakeven = false;

        if (activeTrade.direction === "LONG") {
          if (!activeTrade.breakevenHit && currentCandle.high >= activeTrade.breakevenTarget) {
            activeTrade.breakevenHit = true;
            activeTrade.stopLoss = activeTrade.entry;
          }
          if (currentCandle.low <= activeTrade.stopLoss) {
            hitSL = true;
            if (activeTrade.breakevenHit) hitBreakeven = true;
          }
          if (currentCandle.high >= activeTrade.takeProfit) hitTP = true;
        } else {
          if (!activeTrade.breakevenHit && currentCandle.low <= activeTrade.breakevenTarget) {
            activeTrade.breakevenHit = true;
            activeTrade.stopLoss = activeTrade.entry;
          }
          if (currentCandle.high >= activeTrade.stopLoss) {
            hitSL = true;
            if (activeTrade.breakevenHit) hitBreakeven = true;
          }
          if (currentCandle.low <= activeTrade.takeProfit) hitTP = true;
        }

        if (hitSL || hitTP) {
          totalTrades++;
          
          const positionSize = balance - RESERVE;
          const entryPrice = activeTrade.entry;
          let exitPrice = hitSL ? activeTrade.stopLoss : activeTrade.takeProfit;
          
          let pctChange = activeTrade.direction === "LONG" 
            ? (exitPrice - entryPrice) / entryPrice 
            : (entryPrice - exitPrice) / entryPrice;

          const grossProfit = positionSize * pctChange;
          const balancePostTrade = balance + grossProfit;
          
          const exitFee = positionSize * TAKER_FEE;
          totalFeesPaid += exitFee;
          balance = balancePostTrade - exitFee;

          if (hitSL) {
            if (hitBreakeven) {
              breakevens++;
              console.log(`[${new Date(time).toISOString()}] ⚪ BREAKEVEN ${activeTrade.symbol}. Balance: $${balance.toFixed(2)}`);
            } else {
              losses++;
              console.log(`[${new Date(time).toISOString()}] ❌ STOP LOSS ${activeTrade.symbol}. Balance: $${balance.toFixed(2)}`);
            }
          } else if (hitTP) {
            wins++;
            console.log(`[${new Date(time).toISOString()}] 🏆 TAKE PROFIT ${activeTrade.symbol}. Balance: $${balance.toFixed(2)}`);
          }

          activeTrade = null;
        }
      }
    }

    // 2. BUSQUEDA DE SEÑALES GLOBALES
    if (!activeTrade && balance > MIN_BALANCE) {
      let bestGlobalSignal = null;

      for (const sym of symbols) {
        const data = marketData[sym];
        const slicedLtf = data.ltf.filter(c => c.timestamp <= time);
        const slicedHtf = data.htf.filter(c => c.timestamp <= time);

        if (slicedLtf.length < 200) continue;

        // Mock BTC Trend simple (comparando precio actual con el de hace 50 horas)
        let mockBtcTrend: "UP" | "DOWN" = "UP";
        if (marketData["BTC/USDT"]) {
           const btcData = marketData["BTC/USDT"].ltf.filter(c => c.timestamp <= time);
           if (btcData.length >= 50) {
              mockBtcTrend = btcData[btcData.length - 1].close > btcData[btcData.length - 50].close ? "UP" : "DOWN";
           }
        }

        const pullSignal = pullback.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);
        const momSignal = momentum.analyze(slicedLtf, slicedHtf, fetcher, mockBtcTrend);

        let bestLocalSignal = null;
        if (pullSignal && momSignal) bestLocalSignal = pullSignal.score > momSignal.score ? pullSignal : momSignal;
        else bestLocalSignal = pullSignal || momSignal;

        if (bestLocalSignal) {
          bestLocalSignal = { ...bestLocalSignal, symbol: sym };
          if (!bestGlobalSignal || bestLocalSignal.score > bestGlobalSignal.score) {
            bestGlobalSignal = bestLocalSignal;
          }
        }
      }

      if (bestGlobalSignal) {
        // console.log(`[${new Date(time).toISOString()}] 🚨 SEÑAL DETECTADA: ${bestGlobalSignal.symbol}`);
        activeTrade = { ...bestGlobalSignal, isFilled: false, candlesSinceSignal: 0, breakevenHit: false };
      }
    }
  }

  console.log(`\n===========================================`);
  console.log(`📈 RESULTADOS GLOBALES (30 DÍAS)`);
  console.log(`===========================================`);
  console.log(`Balance Inicial: $25.00`);
  console.log(`Balance Final:   $${balance.toFixed(2)}`);
  
  const roi = ((balance - 25.0) / 25.0) * 100;
  console.log(`Rendimiento Neto (ROI): ${roi > 0 ? "+" : ""}${roi.toFixed(2)}%`);
  console.log(`Comisiones Pagadas a Binance: $${totalFeesPaid.toFixed(2)}`);
  console.log(`-------------------------------------------`);
  console.log(`Trades Totales Llenados: ${totalTrades}`);
  console.log(`Victorias (TP): ${wins}`);
  console.log(`Derrotas (SL): ${losses}`);
  console.log(`Breakevens (0R): ${breakevens}`);
  
  const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : 0;
  console.log(`Winrate: ${winrate}%`);
  console.log(`===========================================\n`);
}

runPortfolioSimulation().catch(console.error);
