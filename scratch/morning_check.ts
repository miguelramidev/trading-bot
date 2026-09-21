import { dataFetcher } from "../src/bot/data.js";
import { db } from "../src/db/index.js";
import ccxt from "ccxt";

async function run() {
  console.log("=== ANÁLISIS MATUTINO ===");
  
  // 1. Balance
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 50
  });
  
  const lastBalance = trades.length > 0 ? parseFloat(trades[0].accountBalance || "0") : 0;
  
  // Trades de las ultimas 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentTrades = trades.filter(t => t.evaluatedAt >= yesterday);
  const tomadas = recentTrades.filter(t => t.decision && t.decision.includes("Tomada"));
  
  console.log(`\n-- CUENTA --`);
  console.log(`Último balance reportado por el bot: $${lastBalance.toFixed(2)}`);
  console.log(`Señales en las últimas 24h: ${recentTrades.length}`);
  console.log(`Operaciones tomadas: ${tomadas.length}`);
  for (const t of tomadas) {
     console.log(`  > ${t.symbol} | ${t.direction} | ${t.decision} | Razón: ${t.reason}`);
  }

  // 2. BTC Macro
  console.log(`\n-- BITCOIN MACRO --`);
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
  const candles1d = await exchange.fetchOHLCV("BTC/USDT", '1d', undefined, 250);
  const closes1d = candles1d.map(c => c[4]);
  
  function calculateEMA(prices: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const emaArray = [prices[0]];
      for (let i = 1; i < prices.length; i++) {
        emaArray.push(prices[i] * k + emaArray[i - 1] * (1 - k));
      }
      return emaArray;
  }
  
  const ema20 = calculateEMA(closes1d, 20);
  const ema50 = calculateEMA(closes1d, 50);
  const ema200 = calculateEMA(closes1d, 200);
  const btcPrice = closes1d[closes1d.length - 1];
  
  console.log(`Precio actual BTC: $${btcPrice}`);
  console.log(`EMA 20 (Diaria): $${ema20[ema20.length - 1].toFixed(2)}`);
  console.log(`EMA 50 (Diaria): $${ema50[ema50.length - 1].toFixed(2)}`);
  console.log(`EMA 200 (Diaria): $${ema200[ema200.length - 1].toFixed(2)}`);
  
  if (btcPrice > ema200[ema200.length - 1]) {
     console.log("Tendencia Diaria (1D): ALCISTA (Bull Market)");
  } else {
     console.log("Tendencia Diaria (1D): BAJISTA (Bear Market)");
  }
  
  const candles4h = await exchange.fetchOHLCV("BTC/USDT", '4h', undefined, 100);
  const closes4h = candles4h.map(c => c[4]);
  const ema50_4h = calculateEMA(closes4h, 50);
  const btcPrice4h = closes4h[closes4h.length - 1];
  
  if (btcPrice4h > ema50_4h[ema50_4h.length - 1]) {
     console.log("Tendencia Micro (4H): ALCISTA");
  } else {
     console.log("Tendencia Micro (4H): BAJISTA (Corrección)");
  }

}

run().then(() => process.exit(0));
