import { Telegraf } from "telegraf";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";
import { Resource } from "sst";

const telegramToken = process.env.TELEGRAM_TOKEN || Resource.TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

async function runAnalysis(timeframe: string) {
  if (timeframe !== "15m") {
    console.log(`[${timeframe}] Ignorado por ahora. Estamos probando estrategia de 15m.`);
    return;
  }

  console.log(`[${timeframe}] Iniciando análisis cron (Nueva Estrategia Paper Trading)...`);
  
  const users = await db.query.userConfig.findMany();
  const activeUsers = users.filter((u) => !u.isPaused);
  if (activeUsers.length === 0) return;

  const dataFetcher = new DataFetcher();
  
  // --- MONITOR DE OPERACIONES ACTIVAS ---
  const activeTrades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.isActiveTrade, true)
  });
  
  for (const trade of activeTrades) {
    try {
      const ticker = await dataFetcher.exchange.fetchTicker(trade.symbol);
      const currentPrice = ticker.last;
      if (!currentPrice) continue;
      
      const sl = parseFloat(trade.stopLoss!);
      const tp = parseFloat(trade.takeProfit!);
      
      let closed = false;
      let closeReason = "";
      
      if (trade.direction === "LONG") {
        if (currentPrice <= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        if (currentPrice >= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      } else {
        if (currentPrice >= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        if (currentPrice <= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      }
      
      if (closed) {
        const finalDecision = `${trade.decision || ''} -> ${closeReason}`;
        await db.update(signalHistory)
          .set({ isActiveTrade: false, decision: finalDecision })
          .where(eq(signalHistory.id, trade.id));
          
        if (trade.decision === "Tomada") {
          const emoji = closeReason.includes("TP") ? "✅🤑" : "❌🩸";
          for (const user of activeUsers) {
            await bot.telegram.sendMessage(user.chatId, `${emoji} <b>Trade Paper Cerrado:</b> ${trade.symbol}\nResultado: ${closeReason}\nPrecio de salida: ${currentPrice}`, { parse_mode: "HTML" });
          }
        }
      }
    } catch (e) {
      console.error(`Error monitoreando ${trade.symbol}:`, e);
    }
  }
  
  const currentlyActiveTrades = await db.query.signalHistory.findMany({
    where: and(eq(signalHistory.isActiveTrade, true), eq(signalHistory.decision, "Tomada"))
  });
  const activeSymbolsToBlock = currentlyActiveTrades.map(s => s.symbol);
  const activeLongsCount = currentlyActiveTrades.filter(t => t.direction === "LONG").length;
  const activeShortsCount = currentlyActiveTrades.filter(t => t.direction === "SHORT").length;

  const btcCandles = await dataFetcher.fetchOhlcv("BTC/USDT:USDT", "15m", 250);
  const btcCloses = btcCandles ? btcCandles.map(c => c.close) : [];

  const pairs = await dataFetcher.getTop100Pairs();

  const last5Signals = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 5
  });
  const recentSymbols = last5Signals.map(s => s.symbol);

  for (const symbol of pairs) {
    if (recentSymbols.includes(symbol)) continue;
    if (activeSymbolsToBlock.includes(symbol)) continue; // Candado: ignorar moneda si el paper trade sigue abierto

    try {
      const candles15m = await dataFetcher.fetchOhlcv(symbol, "15m", 250);
      const candles4h = await dataFetcher.fetchOhlcv(symbol, "4h", 100);
      if (!candles15m || candles15m.length < 200 || !candles4h || candles4h.length < 50) continue;

      const closes15m = candles15m.map(c => c.close);
      const volumes15m = candles15m.map(c => c.volume);
      
      const { adx } = dataFetcher.calculateADX(candles15m, 14);
      const currentAdx = adx[adx.length - 1];

      const bb = dataFetcher.calculateBollingerBands(closes15m, 20, 2);
      const ema200 = dataFetcher.calculateEMA(closes15m, 200);
      const ema21 = dataFetcher.calculateEMA(closes15m, 21);
      const smaVol20 = dataFetcher.calculateSMA(volumes15m, 20);
      const atr14 = dataFetcher.calculateATR(candles15m, 14);
      const rsi14 = dataFetcher.calculateRSI(closes15m, 14);

      const closes4h = candles4h.map(c => c.close);
      const ema50_4h = dataFetcher.calculateEMA(closes4h, 50);
      const currentPrice4h = closes4h[closes4h.length - 1];
      const currentEma4h = ema50_4h[ema50_4h.length - 1];
      const bias4h = currentPrice4h > currentEma4h ? "UP" : "DOWN";

      const currentPrice = closes15m[closes15m.length - 1];
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
        // TENDENCIAL (Estrategia 1)
        if (currentPrice > currentEma200 && bias4h === "UP") {
          // LONG: Pullback a EMA 21
          const touchedEma = currentCandle.low <= currentEma21 * 1.005;
          const heldEma = currentCandle.close >= currentEma21 * 0.998;
          
          if (touchedEma && heldEma && isGreen) {
            if (currentVol > avgVol && prevCandle.volume < avgVol) {
              signal = {
                strategy: "1", direction: "LONG", regime: "Tendencial",
                entry: currentPrice, stopLoss: currentPrice - (1.5 * currentAtr), takeProfit: currentPrice + (2 * 1.5 * currentAtr),
                volumeFilter: "Confirma (Vela Verde + Vol)", reason: "Rebote exitoso en EMA 21 con vela de confirmación"
              };
            }
          }
        } else if (currentPrice < currentEma200 && bias4h === "DOWN") {
          // SHORT: Pullback a EMA 21
          const touchedEma = currentCandle.high >= currentEma21 * 0.995;
          const heldEma = currentCandle.close <= currentEma21 * 1.002;
          
          if (touchedEma && heldEma && isRed) {
             if (prevCandle.volume < avgVol) { // Volumen del rebote aflojado
               signal = {
                 strategy: "1", direction: "SHORT", regime: "Tendencial",
                 entry: currentPrice, stopLoss: currentPrice + (1.5 * currentAtr), takeProfit: currentPrice - (2 * 1.5 * currentAtr),
                 volumeFilter: "Rebote sin volumen", reason: "Rechazo bajista en EMA 21"
               };
             }
          }
        }
      } else if (currentAdx < 20) {
        // RANGO (Estrategia 2)
        const currentLowerBB = bb.lower[bb.lower.length - 1];
        const currentUpperBB = bb.upper[bb.upper.length - 1];
        const currentMiddleBB = bb.middle[bb.middle.length - 1];
        const currentRsi = rsi14[rsi14.length - 1];

        if (candles15m[candles15m.length - 1].low <= currentLowerBB && currentRsi < 30) {
          if (currentVol <= avgVol) {
            signal = {
              strategy: "2", direction: "LONG", regime: "Rango",
              entry: currentPrice, stopLoss: currentPrice - currentAtr, takeProfit: currentMiddleBB,
              volumeFilter: "Plano", reason: "Rechazo en Banda Inferior con RSI bajo"
            };
          }
        } else if (candles15m[candles15m.length - 1].high >= currentUpperBB && currentRsi > 70) {
          if (currentVol <= avgVol) {
            signal = {
              strategy: "2", direction: "SHORT", regime: "Rango",
              entry: currentPrice, stopLoss: currentPrice + currentAtr, takeProfit: currentMiddleBB,
              volumeFilter: "Plano", reason: "Rechazo en Banda Superior con RSI alto"
            };
          }
        }
      }

      if (signal) {
        if (signal.direction === "LONG" && activeLongsCount >= 2) continue;
        if (signal.direction === "SHORT" && activeShortsCount >= 2) continue;

        let fundingRateText = "N/A";
        let oiText = "N/A";

        if (signal.direction === "SHORT") {
          const frHistory = await dataFetcher.fetchFundingRateHistory(symbol, 1);
          if (frHistory && frHistory.length > 0) fundingRateText = frHistory[0].fundingRate.toString();
          
          const oiChange = await dataFetcher.fetchOpenInterestChange4h(symbol);
          const oi = await dataFetcher.fetchOpenInterest(symbol);
          if (oi !== null) oiText = `${oi.toString()} (${oiChange})`;
        }
        
        let btcCorrStr = "N/A";
        if (!symbol.includes("BTC") && btcCloses.length > 0) {
           const corr = dataFetcher.calculateCorrelation(closes15m, btcCloses);
           btcCorrStr = (corr * 100).toFixed(2) + "%";
        }

        const inserted = await db.insert(signalHistory).values({
          symbol, timeframe: "15m", direction: signal.direction,
          entry: signal.entry.toFixed(4), stopLoss: signal.stopLoss.toFixed(4), takeProfit: signal.takeProfit.toFixed(4),
          regime: signal.regime, bias4h: bias4h, strategy: signal.strategy, atr: currentAtr.toFixed(4),
          volumeFilter: signal.volumeFilter, fundingRate: fundingRateText, openInterest: oiText, btcCorrelation: btcCorrStr,
          decision: null // Pendiente
        }).returning({ id: signalHistory.id });
        
        const signalId = inserted[0].id;

        const msg = `🚨 <b>NUEVA SEÑAL PAPER TRADING (15m)</b>\n\n` +
          `🪙 <b>Par:</b> ${symbol}\n` +
          `📈 <b>Dirección:</b> ${signal.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT"}\n` +
          `🧠 <b>Estrategia:</b> ${signal.regime} (Est. ${signal.strategy})\n` +
          `🧭 <b>Sesgo 4h:</b> ${bias4h}\n` +
          `📊 <b>Volumen:</b> ${signal.volumeFilter}\n\n` +
          `🛒 <b>Entrada:</b> ${signal.entry.toFixed(4)}\n` +
          `🛑 <b>Stop Loss:</b> ${signal.stopLoss.toFixed(4)}\n` +
          `🎯 <b>Take Profit:</b> ${signal.takeProfit.toFixed(4)}\n\n` +
          (signal.direction === "SHORT" ? `💰 <b>Funding:</b> ${fundingRateText}\n📈 <b>OI:</b> ${oiText}\n` : "") +
          (btcCorrStr !== "N/A" ? `🔗 <b>Correlación BTC:</b> ${btcCorrStr}\n\n` : "\n") +
          `💡 <i>Motivo: ${signal.reason}</i>`;

        for (const user of activeUsers) {
          await bot.telegram.sendMessage(user.chatId, msg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Tomar Trade (Paper)", callback_data: `paper_accept_${signalId}` },
                  { text: "❌ Descartar", callback_data: `paper_reject_${signalId}` }
                ]
              ]
            }
          });
        }
        
        // Terminar el cron, enviamos 1 sola señal (la mejor del top)
        return;
      }
    } catch (e) {
       console.error(`Error procesando ${symbol}:`, e);
    }
  }
}

export async function handler15m() { await runAnalysis("15m"); }
export async function handler1h() { await runAnalysis("1h"); }
export async function handler4h() { await runAnalysis("4h"); }
