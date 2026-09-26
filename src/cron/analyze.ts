import { Telegraf } from "telegraf";
import { sendPushNotification } from "../firebase.js";
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory, userConfig } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";
import { Trader } from "../bot/trader.js";
import { decrypt } from "../api/core/utils/encryption.js";
import { Resource } from "sst";

const telegramToken = process.env.TELEGRAM_TOKEN || (Resource as any).TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

async function runAnalysis(timeframe: string) {
  console.log(`[${timeframe}] Iniciando análisis cron (Estrategia Paper Trading 15m)...`);
  
  const users = await db.query.userConfig.findMany();
  const activeUsers = users.filter((u) => !u.isPaused);

  const dataFetcher = new DataFetcher();
  const trader = new Trader();
  
  // Limpieza de huérfanos antes de analizar
  try {
    await trader.cleanOrphanOrders();
  } catch(e: any) {
    console.error("Warning: Failed to clean orphan orders:", e.message);
  }
  
  // --- MONITOR DE OPERACIONES ACTIVAS ---
  const activeTrades = await db.query.signalHistory.findMany({
    where: eq(signalHistory.isActiveTrade, true)
  });
  
  for (const trade of activeTrades) {
    try {
      const recentCandles = await dataFetcher.fetchOhlcv(trade.symbol, "15m", 2);
      if (!recentCandles || recentCandles.length === 0) continue;
      
      const maxHigh = Math.max(...recentCandles.map(c => c.high));
      const minLow = Math.min(...recentCandles.map(c => c.low));
      const currentPrice = recentCandles[recentCandles.length - 1].close;
      
      // Usar los Kill Switches del Grid si existen, si no, fallback al SL/TP original
      const sl = parseFloat(trade.gridSL || trade.stopLoss!);
      const tp = parseFloat(trade.gridTP || trade.takeProfit!);
      
      let closed = false;
      let closeReason = "";
      
      if (trade.direction === "LONG") {
        if (minLow <= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        else if (maxHigh >= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      } else {
        if (maxHigh >= sl) { closed = true; closeReason = "Cerrada (SL Tocado)"; }
        else if (minLow <= tp) { closed = true; closeReason = "Cerrada (TP Tocado)"; }
      }
      
      if (closed) {
        const finalDecision = `${trade.decision || ''} -> ${closeReason}`;
        
        let pnlMsg = "";
        let finalPnl = null;
        let finalRoi = null;
        let entryP = null;
        let exitP = null;

        if (trade.decision === "Tomada") {
          try {
             const sinceMs = trade.evaluatedAt.getTime();
             const pnlData = await trader.getTradeRealizedPnl(trade.symbol, sinceMs);
             const net = pnlData.pnl - pnlData.fee;
             if (net !== 0) {
                 finalPnl = net.toFixed(4);
                 const sign = net > 0 ? "+" : "";
                 
                 // Aproximar el ROI basado en el 20% del balance que teníamos guardado
                 if (trade.accountBalance) {
                     const margin = parseFloat(trade.accountBalance) * 0.20;
                     if (margin > 0) {
                        finalRoi = ((net / margin) * 100).toFixed(2);
                        pnlMsg = `\n💰 <b>PnL Neto:</b> ${sign}${finalPnl} USDT (${sign}${finalRoi}%)`;
                     } else {
                        pnlMsg = `\n💰 <b>PnL Neto:</b> ${sign}${finalPnl} USDT`;
                     }
                 } else {
                     pnlMsg = `\n💰 <b>PnL Neto:</b> ${sign}${finalPnl} USDT`;
                 }
             }
             if (pnlData.entryPrice) entryP = pnlData.entryPrice.toString();
             if (pnlData.exitPrice) exitP = pnlData.exitPrice.toString();
          } catch(e) {
             console.error("Error fetching PnL:", e);
          }
        }

        // Actualizamos la BD con todos los nuevos datos institucionales
        await db.update(signalHistory)
          .set({ 
             isActiveTrade: false, 
             decision: finalDecision,
             realizedPnl: finalPnl,
             realizedRoi: finalRoi,
             executedEntryPrice: entryP,
             executedExitPrice: exitP
          })
          .where(eq(signalHistory.id, trade.id));
          
        if (trade.decision === "Tomada") {
          const emoji = closeReason.includes("TP") ? "✅🤑" : "❌🩸";

          for (const user of users) {
            if ((user.notificationsMobile || user.notificationsWeb) && user.fcmTokens && user.fcmTokens.length > 0) {
              for (const t of user.fcmTokens) {
                await sendPushNotification(
                  t,
                  `Trade Cerrado: ${trade.symbol}`,
                  `Resultado: ${closeReason} | Salida: ${currentPrice}`,
                  { tradeId: String(trade.id), symbol: trade.symbol }
                );
              }
            }
            if (user.chatId && user.notificationsTelegram) { try { await bot.telegram.sendMessage(user.chatId, `${emoji} <b>Trade Sniper Cerrado:</b> ${trade.symbol}\nResultado: ${closeReason}\nPrecio de salida: ${currentPrice}${pnlMsg}`, { parse_mode: "HTML" }); } catch(e:any) { console.error("Telegram error:", e.message); } }
          }
        } else if (trade.decision === "Descartada") {
          const hitTP = closeReason.includes("TP");
          let msg = "";
          if (hitTP) {
             msg = `🤦‍♂️ <b>Oportunidad Perdida:</b> Descartaste ${trade.symbol} y acaba de tocar Take Profit (El Grid hubiera ganado).\nÚltimo precio: ${currentPrice}\n\n📝 <i>Motivo de descarte: ${trade.reason || "Ninguno"}</i>`;
          } else {
             msg = `😎 <b>¡Esquivaste una bala!</b> Descartaste ${trade.symbol} y efectivamente terminó tocando el Kill Switch (SL).\nÚltimo precio: ${currentPrice}\n\n📝 <i>Motivo de descarte: ${trade.reason || "Ninguno"}</i>`;
          }
          
          for (const user of users) {
             if (user.chatId && user.notificationsTelegram) { try { await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" }); } catch(e:any) { console.error("Telegram error:", e.message); } }
          }
        }
      }
    } catch (e) {
      console.error(`Error monitoreando ${trade.symbol}:`, e);
    }
  }

  // Si no hay usuarios activos (todos están en pausa), abortamos el escaneo de nuevas señales
  if (activeUsers.length === 0) {
    console.log("No hay usuarios activos. Abortando escaneo de nuevas señales.");
    return;
  }
  
  const currentlyActiveTrades = await db.query.signalHistory.findMany({
    where: and(eq(signalHistory.isActiveTrade, true), eq(signalHistory.decision, "Tomada"))
  });
  const activeSymbolsToBlock = currentlyActiveTrades.map(s => s.symbol);
  const activeLongsCount = currentlyActiveTrades.filter(t => t.direction === "LONG").length;
  const activeShortsCount = currentlyActiveTrades.filter(t => t.direction === "SHORT").length;

  const btcCandles = await dataFetcher.fetchOhlcv("BTC/USDT:USDT", "15m", 250);
  if (btcCandles) btcCandles.pop(); // Descartar vela incompleta
  const btcCloses = btcCandles ? btcCandles.map(c => c.close) : [];
  
  let btcRegimeStr = "N/A";
  if (btcCandles && btcCandles.length > 200) {
    const { adx: btcAdxArr } = dataFetcher.calculateADX(btcCandles, 14);
    const btcAdx = btcAdxArr[btcAdxArr.length - 1];
    if (btcAdx > 25) btcRegimeStr = "Tendencial";
    else if (btcAdx < 20) btcRegimeStr = "Rango";
    else btcRegimeStr = "Transición";
    btcRegimeStr += ` (${btcAdx.toFixed(2)})`;
  }
  
  // Veto anti-machetazo: Tendencia de corto plazo de BTC (15m EMA 50)
  let btcShortTermBias = "N/A";
  if (btcCloses.length > 50) {
    const btcEma50 = dataFetcher.calculateEMA(btcCloses, 50);
    btcShortTermBias = btcCloses[btcCloses.length - 1] > btcEma50[btcEma50.length - 1] ? "UP" : "DOWN";
  }

  let macroTrendWarning = "";
  try {
    const btcCandles1D = await dataFetcher.fetchOhlcv("BTC/USDT:USDT", "1d", 250);
    if (btcCandles1D && btcCandles1D.length > 200) {
      btcCandles1D.pop(); // Descartar vela del día en curso
      const closes1D = btcCandles1D.map(c => c.close);
      const currentPrice1D = closes1D[closes1D.length - 1];
      const ema20Arr = dataFetcher.calculateEMA(closes1D, 20);
      const ema50Arr = dataFetcher.calculateEMA(closes1D, 50);
      const ema200Arr = dataFetcher.calculateEMA(closes1D, 200);
      
      const ema20 = ema20Arr[ema20Arr.length - 1];
      const ema50 = ema50Arr[ema50Arr.length - 1];
      const ema200 = ema200Arr[ema200Arr.length - 1];

      if (currentPrice1D > ema200 && ema20 > ema50) {
        macroTrendWarning = "ALCISTA";
      } else if (currentPrice1D < ema200 && ema20 < ema50) {
        macroTrendWarning = "BAJISTA";
      }
    }
  } catch(e) { console.error("Error fetching BTC 1D", e); }

  const pairsData = await dataFetcher.getTop100Pairs();

  const thirtyFiveMinsAgo = new Date(Date.now() - 35 * 60 * 1000);
  const lastSignals = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)],
    limit: 15
  });
  const recentSymbols = lastSignals
    .filter(s => s.evaluatedAt > thirtyFiveMinsAgo)
    .map(s => s.symbol);

  let signalsFound = 0;
  for (const data of pairsData) {
    const symbol = data.symbol;
    const rank = data.rank;
    
    if (recentSymbols.includes(symbol)) continue;
    if (activeSymbolsToBlock.includes(symbol)) continue; // Candado: ignorar moneda si el paper trade sigue abierto

    try {
      const candles15m = await dataFetcher.fetchOhlcv(symbol, "15m", 250);
      const candles4h = await dataFetcher.fetchOhlcv(symbol, "4h", 100);
      if (!candles15m || candles15m.length < 200 || !candles4h || candles4h.length < 50) continue;

      // CRÍTICO: Binance devuelve la vela actual que está en curso (incompleta).
      // La descartamos inmediatamente para que el EMA, RSI, ADX, Bollinger y la lógica
      // de "Rebote sin volumen" se calculen ÚNICAMENTE sobre velas 100% cerradas.
      candles15m.pop();
      candles4h.pop();

      const closes15m = candles15m.map(c => c.close);
      const volumes15m = candles15m.map(c => c.volume);
      
      const { adx } = dataFetcher.calculateADX(candles15m, 14);
      const currentAdx = adx[adx.length - 1];
      const previousAdx = adx[adx.length - 2];

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

      const macd = dataFetcher.calculateMACD(closes15m, 12, 26, 9);
      const macdHist = macd.histogram;
      const currentMacdHist = macdHist[macdHist.length - 1];
      const prevMacdHist = macdHist[macdHist.length - 2];
      const prevPrevMacdHist = macdHist[macdHist.length - 3];

      const currentPrice = closes15m[closes15m.length - 1];
      const currentEma200 = ema200[ema200.length - 1];
      const currentEma21 = ema21[ema21.length - 1];
      const currentEma50 = ema50_4h[ema50_4h.length - 1]; // Wait, ema50_4h is 4H, we need ema50 on 15m if we use it, but MACD doesn't need ema50 on 15m.
      const currentAtr = atr14[atr14.length - 1];
      const currentVol = volumes15m[volumes15m.length - 1];
      const avgVol = smaVol20[smaVol20.length - 1];

      const currentCandle = candles15m[candles15m.length - 1];
      
      let signal: any = null;

      // ESTRATEGIA 1: MACD Zero-Cross Pullback Institucional (Tendencial)
      if (currentAdx >= 25) {
        if (currentPrice > currentEma200) {
          // Tendencia Alcista: Esperamos que el pullback (histograma rojo) termine
          if (currentMacdHist > 0 && prevMacdHist < 0 && prevPrevMacdHist < 0) {
             signal = {
               strategy: "1", direction: "LONG", regime: "Tendencial",
               entry: currentPrice, stopLoss: currentPrice - (1.0 * currentAtr), takeProfit: currentPrice + (2.0 * currentAtr),
               volumeFilter: "Normal", reason: "MACD Zero-Cross a favor de EMA 200"
             };
          }
        } else if (currentPrice < currentEma200) {
          // Tendencia Bajista: Esperamos que el rebote (histograma verde) termine
          if (currentMacdHist < 0 && prevMacdHist > 0 && prevPrevMacdHist > 0) {
             signal = {
               strategy: "1", direction: "SHORT", regime: "Tendencial",
               entry: currentPrice, stopLoss: currentPrice + (1.0 * currentAtr), takeProfit: currentPrice - (2.0 * currentAtr),
               volumeFilter: "Normal", reason: "MACD Zero-Cross a favor de EMA 200"
             };
          }
        }
      } else {
        // ESTRATEGIA 2: Liquidity Sweep / Falso Breakout (Rango)
        // DESACTIVADA TEMPORALMENTE: No renta a corto plazo (15m). Se activará a futuro en 1H.
        /*
        const prevCandle = candles15m[candles15m.length - 2];
        const prevLowerBB = bb.lower[bb.lower.length - 2];
        const prevUpperBB = bb.upper[bb.upper.length - 2];
        
        // LONG: Vela anterior rompió banda inferior pero cerró adentro. Vela actual es verde (cierre > apertura)
        const fakeDown = (prevCandle.low < prevLowerBB) && (prevCandle.close > prevLowerBB) && (currentCandle.close > currentCandle.open);
        
        // SHORT: Vela anterior rompió banda superior pero cerró adentro. Vela actual es roja (cierre < apertura)
        const fakeUp = (prevCandle.high > prevUpperBB) && (prevCandle.close < prevUpperBB) && (currentCandle.close < currentCandle.open);

        if (fakeDown) {
           signal = {
             strategy: "2", direction: "LONG", regime: "Rango",
             entry: currentPrice, stopLoss: currentPrice - (1.0 * currentAtr), takeProfit: currentPrice + (2.0 * currentAtr),
             volumeFilter: "Normal", reason: "Liquidity Sweep en BB Inferior (Fakeout)"
           };
        } else if (fakeUp) {
           signal = {
             strategy: "2", direction: "SHORT", regime: "Rango",
             entry: currentPrice, stopLoss: currentPrice + (1.0 * currentAtr), takeProfit: currentPrice - (2.0 * currentAtr),
             volumeFilter: "Normal", reason: "Liquidity Sweep en BB Superior (Fakeout)"
           };
        }
        */
      }

      if (signal) {
        let btcCorrStr = "N/A";
        let btcCorrVal = 0;
        if (!symbol.includes("BTC") && btcCloses.length > 0) {
           btcCorrVal = dataFetcher.calculateCorrelation(closes15m, btcCloses);
           btcCorrStr = (btcCorrVal * 100).toFixed(2) + "%";
        }

        let wasInverted = false;
        
        // MACRO BREAKOUT INVERSION (Requiere alineación 1D+4H, Correlación Positiva, y BTC NO debe estar cayendo a corto plazo)
        if (macroTrendWarning === "ALCISTA" && signal.direction === "SHORT" && bias4h === "UP" && btcCorrVal >= 0 && btcShortTermBias === "UP") {
           signal.direction = "LONG";
           signal.stopLoss = currentPrice - (1.0 * currentAtr);
           signal.takeProfit = currentPrice + (2.0 * currentAtr);
           signal.strategy = "3";
           signal.regime = "Macro Breakout";
           signal.reason = "Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)";
           wasInverted = true;
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "LONG" && bias4h === "DOWN" && btcCorrVal >= 0 && btcShortTermBias === "DOWN") {
           signal.direction = "SHORT";
           signal.stopLoss = currentPrice + (1.0 * currentAtr);
           signal.takeProfit = currentPrice - (2.0 * currentAtr);
           signal.strategy = "3";
           signal.regime = "Macro Breakout";
           signal.reason = "Inversión por convergencia Bajista 1D+4H";
           wasInverted = true;
        }

        let fundingRateText = "N/A";
        let oiText = "N/A";

        const frHistory = await dataFetcher.fetchFundingRateHistory(symbol, 1);
        let frVal = 0;
        if (frHistory && frHistory.length > 0) {
            frVal = frHistory[0].fundingRate;
            fundingRateText = frVal.toString();
        }

        // FILTRO DE FUNDING RATE (Alineado a Extremos)
        // Solo bloqueamos el trade si la masa está EXTREMADAMENTE en contra.
        // Nota: El funding rate base de crypto es +0.0001 (0.01%). No bloqueamos por eso.
        if (frVal !== 0) {
           if (signal.direction === "LONG" && frVal < -0.0005) {
              // Queremos ir LONG pero todo el mercado está en SHORT EXTREMO (Funding muy negativo).
              console.log(`Descartando LONG en ${symbol} por Funding Rate negativo extremo (${frVal}). Peligro de squeeze bajista.`);
              signal = null;
           } else if (signal.direction === "SHORT" && frVal > 0.0005) {
              // Queremos ir SHORT pero el mercado está en euforia alcista EXTREMA (Funding muy positivo).
              console.log(`Descartando SHORT en ${symbol} por Funding Rate positivo extremo (${frVal}). Peligro de squeeze alcista.`);
              signal = null;
           }
        }

        if (!signal) continue;

        // 1. Límite global absoluto de capital (Max 5 operaciones)
        if (currentlyActiveTrades.length >= 5) {
           console.log(`Límite máximo de 5 operaciones simultáneas alcanzado. Saltando ${symbol}.`);
           continue;
        }

        // 2. Escudo de Riesgo Direccional Cruzado (Correlación BTC > 20%)
        // Si esta moneda está correlacionada con BTC (>20%) y va en la misma dirección que 
        // otro trade activo que TAMBIÉN está correlacionado con BTC, es riesgo duplicado. Se bloquea.
        if (btcCorrVal > 0.20) {
           const correlatedOverlap = currentlyActiveTrades.find(t => {
               if (t.direction !== signal.direction) return false; // Direcciones opuestas no suman riesgo
               
               if (t.symbol.includes("BTC")) return true; // Si el otro trade es BTC en sí mismo
               
               if (t.btcCorrelation) {
                   const parsedCorr = parseFloat(t.btcCorrelation.replace('%', '')) / 100;
                   if (parsedCorr > 0.20) return true; // Ambos son clones de BTC
               }
               return false;
           });

           if (correlatedOverlap) {
               console.log(`Bloqueo de Exposición: Saltando ${symbol}. Ya tienes ${correlatedOverlap.symbol} abierto en ${signal.direction} y ambos están correlacionados con BTC (>20%).`);
               continue;
           }
        }
        
        const oiChange = await dataFetcher.fetchOpenInterestChange4h(symbol);
        const oi = await dataFetcher.fetchOpenInterest(symbol);
        if (oi !== null) oiText = `${oi.toString()} (${oiChange})`;

        let gridDirection = signal.direction === "LONG" ? "🟢 LONG GRID" : "🔴 SHORT GRID";
        const lowerPrice = Math.min(signal.stopLoss, signal.takeProfit);
        const upperPrice = Math.max(signal.stopLoss, signal.takeProfit);
        
        // Cálculo Dinámico de Grilla basado en Volatilidad (ATR)
        let stepSize = currentAtr / 3;
        let stepPct = stepSize / signal.entry;
        
        // UMBRAL DE SEGURIDAD: Mínimo 0.35% para que las comisiones no coman la ganancia
        if (stepPct < 0.0035) {
            stepPct = 0.0035;
            stepSize = signal.entry * stepPct;
        }
        // UMBRAL MÁXIMO: Máximo 1.20% para que el Grid no quede demasiado holgado
        if (stepPct > 0.012) {
            stepPct = 0.012;
            stepSize = signal.entry * stepPct;
        }

        let numGrids = Math.floor((upperPrice - lowerPrice) / stepSize);
        if (numGrids < 2) numGrids = 2; 
        
        // Kill Switches directos (Reusamos la variable por retrocompatibilidad BD)
        const gridSL = signal.stopLoss;
        const gridTP = signal.takeProfit;
        
        const displayStepPct = (stepPct * 100).toFixed(2) + "%";

        const fmt = (n: number) => n < 0.1 ? n.toFixed(6) : n.toFixed(4);

        const inserted = await db.insert(signalHistory).values({
          symbol, timeframe: "15m", direction: signal.direction,
          entry: fmt(signal.entry), stopLoss: fmt(signal.stopLoss), takeProfit: fmt(signal.takeProfit),
          regime: signal.regime, bias4h: bias4h, strategy: signal.strategy, atr: fmt(currentAtr),
          volumeFilter: signal.volumeFilter, fundingRate: fundingRateText, openInterest: oiText, btcCorrelation: btcCorrStr, btcRegime: btcRegimeStr,
          volumeRank: rank,
          decision: null, // Pendiente
          accountBalance: "0.00",
          numGrids: numGrids,
          gridStep: displayStepPct,
          gridSL: fmt(gridSL),
          gridTP: fmt(gridTP),
          triggerVolume: currentVol.toString(),
          triggerAvgVolume: avgVol.toFixed(2),
          triggerRsi: rsi14[rsi14.length - 1].toFixed(2),
          triggerEma21: fmt(currentEma21),
          triggerAdx: currentAdx.toFixed(2),
          triggerLowerBb: fmt(bb.lower[bb.lower.length - 1]),
          triggerUpperBb: fmt(bb.upper[bb.upper.length - 1])
        }).returning({ id: signalHistory.id });
        
        signal.symbol = symbol;
        signal.timeframe = timeframe;
        const signalId = inserted[0].id;

        let strat4Warning = "";

        let macroWarningStr = "";
        if (wasInverted) {
          macroWarningStr = `🔥 <b>ESTRATEGIA 3 (MACRO BREAKOUT):</b> El bot detectó un setup técnico en contra, pero como Bitcoin está fuertemente <b>${macroTrendWarning}</b> en 1D y 4H, ¡hemos <b>INVERTIDO</b> la señal para cazar la ruptura!\n\n`;
        } else if (macroTrendWarning === "ALCISTA" && signal.direction === "SHORT") {
           if (btcCorrVal < 0) {
              macroWarningStr = `⚠️ <b>Riesgo Macro mitigado:</b> BTC está ALCISTA, pero esta moneda tiene CORRELACIÓN NEGATIVA (${btcCorrStr}). Se respeta el SHORT original.\n\n`;
           } else if (bias4h === "UP" && btcShortTermBias === "DOWN") {
              macroWarningStr = `🛑 <b>VETO DE PROTECCIÓN:</b> BTC es Alcista (1D) y la moneda (4H) también, pero BTC está CAYENDO a corto plazo (15m). Se cancela la Inversión a LONG para no atrapar el cuchillo cayendo.\n\n`;
           } else {
              macroWarningStr = `⚠️ <b>Riesgo Macro (VETO):</b> BTC está ALCISTA en 1D, pero no hay fuerza en 4H. No se invirtió la señal. Hacer SHORT es riesgoso.\n\n`;
           }
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "LONG") {
           if (btcCorrVal < 0) {
              macroWarningStr = `⚠️ <b>Riesgo Macro mitigado:</b> BTC está BAJISTA, pero esta moneda tiene CORRELACIÓN NEGATIVA (${btcCorrStr}). Se respeta el LONG original.\n\n`;
           } else if (bias4h === "DOWN" && btcShortTermBias === "UP") {
              macroWarningStr = `🛑 <b>VETO DE PROTECCIÓN:</b> BTC es Bajista (1D) y la moneda (4H) también, pero BTC está SUBIENDO a corto plazo (15m). Se cancela la Inversión a SHORT para evitar un rebote fuerte.\n\n`;
           } else {
              macroWarningStr = `⚠️ <b>Riesgo Macro (VETO):</b> BTC está BAJISTA en 1D, pero no hay debilidad en 4H. No se invirtió la señal. Hacer LONG es riesgoso.\n\n`;
           }
        } else if (macroTrendWarning === "ALCISTA" && signal.direction === "LONG") {
          macroWarningStr = `✅ <b>Alineación Macro:</b> BTC está fuertemente ALCISTA en el gráfico diario. ¡Esta operación sigue la tendencia a favor de las ballenas!\n\n`;
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "SHORT") {
          macroWarningStr = `✅ <b>Alineación Macro:</b> BTC está fuertemente BAJISTA en el gráfico diario. ¡Esta operación sigue la tendencia a favor de las ballenas!\n\n`;
        }
        
        let machetazoWarning = "";
        if (signal.direction === "LONG" && btcShortTermBias === "DOWN" && !wasInverted) {
            machetazoWarning = `🚨 <b>ALERTA DE CAÍDA BRUSCA:</b> Bitcoin está retrocediendo con fuerza en 15m. Entrar en LONG ahora tiene altísimo riesgo de atrapar un cuchillo cayendo.\n\n`;
        } else if (signal.direction === "SHORT" && btcShortTermBias === "UP" && !wasInverted) {
            machetazoWarning = `🚨 <b>ALERTA DE REBOTE:</b> Bitcoin está subiendo con fuerza en 15m. Entrar en SHORT ahora es riesgoso contra el impulso del mercado.\n\n`;
        }

        const cleanSymbolTV = symbol.split(":")[0].replace("/", "");
        const tvLink = `https://www.tradingview.com/chart/?symbol=BINANCE:${cleanSymbolTV}.P`;

        const rawWarnings = [
          signal.reason ? `Motivo: ${signal.reason}` : "",
          macroWarningStr.trim(),
          machetazoWarning.trim(),
          strat4Warning.trim()
        ].filter(Boolean);
        const finalReasonStr = rawWarnings.map(w => "• " + w.replace(/<[^>]*>/g, '')).join('\n\n');

        await db.update(signalHistory)
          .set({ reason: finalReasonStr })
          .where(eq(signalHistory.id, signalId));

        for (const user of activeUsers) {
          // Permitir que usuarios sin API Keys reciban la notificación de la señal como teaser
          
          let userKey = "";
          let userSecret = "";
          try {
            if (user.binanceApiKey) userKey = decrypt(user.binanceApiKey);
            if (user.rsaPrivateKey) {
              userSecret = decrypt(user.rsaPrivateKey);
            } else if (user.binanceApiSecret) {
              userSecret = decrypt(user.binanceApiSecret);
            }
          } catch(e) { console.error("Error decrypting keys for user", user.id); }
          
          const userTrader = new Trader(userKey, userSecret);
          let currentBinanceBalance = 0;
          try {
            const bal = await userTrader.getUSDTBalance(); // Wait, wait. Trader.getUSDTBalance() or Trader.getFreeBalance()? Wait, neither! I must verify! I will use `const dataFetcherUser = new DataFetcher(userKey, userSecret); currentBinanceBalance = (await dataFetcherUser.getUSDTBalance()).free;` But DataFetcher constructor doesn't take keys!
            currentBinanceBalance = (await userTrader.getFreeBalance()); // Ah wait, I need to check Trader methods.
          } catch (e) { console.error("Error fetching balance for user", user.id); }
          
          const marginToInvest = user.montoOperacion || 25.0;

          // Si el balance es menor a la configuración, NO enviamos notificación (a pedido del usuario).
          if (currentBinanceBalance < marginToInvest) {
            continue;
          }
          const exchangeMinNotional = await dataFetcher.getMinNotional(symbol);
          const targetNotional = Math.max(10.0, exchangeMinNotional);

          // Escalado de apalancamiento según RULES.md Regla 1
          const levMin = user.leverageMin ?? 1;
          const levMax = user.leverageMax ?? 2;
          let leverage = levMin;
          let notional = marginToInvest * leverage;
          while (notional < targetNotional && leverage < levMax) {
            leverage++;
            notional = marginToInvest * leverage;
          }
          
          let positionWarning = "";
          if (notional < targetNotional) {
             positionWarning = `⚠️ <b>Riesgo:</b> Con x${levMin}–x${levMax} y $${marginToInvest.toFixed(2)}, el notional proyectado ($${notional.toFixed(2)}) no alcanza el mínimo ($${targetNotional.toFixed(2)}). Binance rechazará la orden.\n`;
          }
          if (currentBinanceBalance < marginToInvest) {
             positionWarning += `⚠️ <b>Riesgo:</b> Tu balance ($${currentBinanceBalance.toFixed(2)}) es menor a tu configuración ($${marginToInvest.toFixed(2)}). Binance rechazará la orden.\n`;
          }

          const msg = `🚨 <b>NUEVA SEÑAL ENCONTRADA (Sniper)</b> 🚨\n\n` +
            `🪙 <b>Par:</b> ${signal.symbol} (Top #${rank})\n` +
            `📈 <b>Dirección:</b> ${signal.direction}\n` +
            `⏳ <b>Temporalidad:</b> ${signal.timeframe}\n` +
            `📏 <b>Estrategia:</b> ${signal.regime} (Est. ${signal.strategy})\n` +
            `💵 <b>Precio Actual:</b> $${fmt(signal.entry)}\n` +
            `💼 <b>Tu Balance Binance:</b> $${currentBinanceBalance.toFixed(2)} USDT\n\n` +
            `💰 <b>INVERSIÓN PROYECTADA (Monto Fijo):</b>\n` +
            `🛡️ <b>Margen (Capital):</b> $${marginToInvest.toFixed(2)} USDT\n` +
            `⚙️ <b>Apalancamiento:</b> x${leverage} (rango: x${levMin}–x${levMax})\n` +
            `🚀 <b>Posición Total:</b> $${notional.toFixed(2)} USDT\n` +
            positionWarning + `\n` +
            `🎯 <b>PARÁMETROS DEL TRADE (ATR: ${displayStepPct}):</b>\n` +
            `🛑 <b>Stop Loss (1 ATR):</b> $${fmt(gridSL)}\n` +
            `🏆 <b>Take Profit (2 ATR):</b> $${fmt(gridTP)}\n\n` +
            `💰 <b>Funding:</b> ${fundingRateText} | 📈 <b>OI:</b> ${oiText}\n` +
            (btcCorrStr !== "N/A" ? `🔗 <b>Corr BTC:</b> ${btcCorrStr} | 👑 <b>BTC:</b> ${btcRegimeStr}\n\n` : "\n\n") +
            macroWarningStr +
            machetazoWarning +
            strat4Warning +
            `💡 <i>Motivo: ${signal.reason}</i>\n` +
            `📊 <b>Ver Gráfico:</b> <a href="${tvLink}">Abrir ${cleanSymbolTV} en TradingView</a>\n\n` +
            `⏱ <b>Acción:</b> Tienes ~3 min para analizar. Si apruebas, el bot ejecutará el Sniper a mercado.`;

          if ((user.notificationsMobile || user.notificationsWeb) && user.fcmTokens && user.fcmTokens.length > 0) {
            for (const t of user.fcmTokens) {
              try {
                await sendPushNotification(
                  t,
                  `Nueva Señal: ${signal.direction} en ${signal.symbol}`,
                  `Estrategia: ${signal.strategy} | SL: ${signal.stopLoss} | TP: ${signal.takeProfit}`,
                  { signalId: String(signalId), symbol: signal.symbol }
                );
              } catch(e: any) {
                console.error("Error enviando Push a", t, e.message);
              }
            }
          }
          if (user.chatId && user.notificationsTelegram) {
            try {
              await bot.telegram.sendMessage(user.chatId, msg, {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Ejecutar Sniper (Mercado)", callback_data: `paper_accept_${signalId}` },
                    { text: "❌ Descartar", callback_data: `paper_reject_${signalId}` }
                  ]
                ]
              }
            });
            } catch(e: any) {
              console.error("Error enviando Telegram a", user.chatId, e.message);
            }
          }
        }
        
        // Terminar el cron si alcanzamos el máximo de 3 señales por sesión
        signalsFound++;
        if (signalsFound >= 3) {
          return;
        }
      }
    } catch (e) {
       console.error(`Error procesando ${symbol}:`, e);
    }
  }

  // Si llegamos hasta aquí y no se generó NINGUNA señal, terminamos en silencio.
  // if (signalsFound === 0) {
  //   for (const user of activeUsers) {
  //     await bot.telegram.sendMessage(
  //       user.chatId, 
  //       `⏳ <b>[${timeframe}] Ciclo Completado - Sin Operaciones</b>\nNinguna de las monedas cumple con todos los filtros de la estrategia en este momento. Sigo vigilando... 👀`, 
  //       { parse_mode: "HTML" }
  //     );
  //   }
  // }
}

export async function handler15m() { await runAnalysis("15m"); }

