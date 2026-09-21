import { Telegraf } from "telegraf";
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory, userConfig } from "../db/schema.js";
import { DataFetcher } from "../bot/data.js";
import { Trader } from "../bot/trader.js";
import { Resource } from "sst";

const telegramToken = process.env.TELEGRAM_TOKEN || Resource.TELEGRAM_TOKEN.value;
const bot = new Telegraf(telegramToken);

async function runAnalysis(timeframe: string) {
  console.log(`[${timeframe}] Iniciando análisis cron (Estrategia Paper Trading 15m)...`);
  
  const users = await db.query.userConfig.findMany();
  const activeUsers = users.filter((u) => !u.isPaused);

  const dataFetcher = new DataFetcher();
  const trader = new Trader();
  
  // Limpieza de huérfanos antes de analizar
  await trader.cleanOrphanOrders();
  
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
        await db.update(signalHistory)
          .set({ isActiveTrade: false, decision: finalDecision })
          .where(eq(signalHistory.id, trade.id));
          
        if (trade.decision === "Tomada") {
          const emoji = closeReason.includes("TP") ? "✅🤑" : "❌🩸";
          for (const user of users) {
            await bot.telegram.sendMessage(user.chatId, `${emoji} <b>Trade Grid Cerrado:</b> ${trade.symbol}\nResultado: ${closeReason}\nPrecio de salida: ${currentPrice}`, { parse_mode: "HTML" });
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
             await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: "HTML" });
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

  let macroTrendWarning = "";
  try {
    const btcCandles1D = await dataFetcher.fetchOhlcv("BTC/USDT:USDT", "1d", 250);
    if (btcCandles1D && btcCandles1D.length > 200) {
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

  const balanceObj = await dataFetcher.getUSDTBalance();
  const currentBinanceBalance = balanceObj.total;
  
  if (currentBinanceBalance < 15) {
    console.log(`Balance insuficiente (${currentBinanceBalance}). Abortando análisis.`);
    for (const user of activeUsers) {
      await bot.telegram.sendMessage(
        user.chatId,
        `⚠️ <b>Balance Insuficiente</b>\nTu saldo libre es de <b>$${currentBinanceBalance.toFixed(2)} USDT</b> (Mínimo requerido: $15).\n\n<i>El bot no escaneará el mercado. Usa /pause si deseas silenciar estos avisos.</i>`,
        { parse_mode: "HTML" }
      );
    }
    return; // No se esfuerza en analizar
  }

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
                entry: currentPrice, stopLoss: currentPrice - (1.0 * currentAtr), takeProfit: currentPrice + (2.0 * currentAtr),
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
                 entry: currentPrice, stopLoss: currentPrice + (1.0 * currentAtr), takeProfit: currentPrice - (2.0 * currentAtr),
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
        let btcCorrStr = "N/A";
        let btcCorrVal = 0;
        if (!symbol.includes("BTC") && btcCloses.length > 0) {
           btcCorrVal = dataFetcher.calculateCorrelation(closes15m, btcCloses);
           btcCorrStr = (btcCorrVal * 100).toFixed(2) + "%";
        }

        let wasInverted = false;
        
        // MACRO BREAKOUT INVERSION (Requiere alineación 1D+4H y Correlación Positiva)
        if (macroTrendWarning === "ALCISTA" && signal.direction === "SHORT" && bias4h === "UP" && btcCorrVal >= 0) {
           signal.direction = "LONG";
           signal.stopLoss = currentPrice - (1.0 * currentAtr);
           signal.takeProfit = currentPrice + (2.0 * currentAtr);
           signal.strategy = "3";
           signal.regime = "Macro Breakout";
           signal.reason = "Inversión por convergencia Alcista 1D+4H";
           wasInverted = true;
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "LONG" && bias4h === "DOWN" && btcCorrVal >= 0) {
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

        // ESTRATEGIA 4: LIQUIDITY HUNTER (Inversión por Funding Rate en contra)
        let strat4Inverted = false;
        if (frVal !== 0) {
           if (signal.direction === "LONG" && frVal > 0) {
              // Masa apalancada en LONG -> Market Maker barrerá hacia abajo. Vamos SHORT.
              signal.direction = "SHORT";
              signal.stopLoss = currentPrice + (1.0 * currentAtr);
              signal.takeProfit = currentPrice - (2.0 * currentAtr);
              signal.strategy = "4";
              signal.regime = "Liquidity Hunter";
              signal.reason = "Inversión contra la masa (Funding Rate > 0)";
              strat4Inverted = true;
           } else if (signal.direction === "SHORT" && frVal < 0) {
              // Masa apalancada en SHORT -> Market Maker barrerá hacia arriba. Vamos LONG.
              signal.direction = "LONG";
              signal.stopLoss = currentPrice - (1.0 * currentAtr);
              signal.takeProfit = currentPrice + (2.0 * currentAtr);
              signal.strategy = "4";
              signal.regime = "Liquidity Hunter";
              signal.reason = "Inversión contra la masa (Funding Rate < 0)";
              strat4Inverted = true;
           }
        }

        if (signal.direction === "LONG" && activeLongsCount >= 2) continue;
        if (signal.direction === "SHORT" && activeShortsCount >= 2) continue;
        
        const oiChange = await dataFetcher.fetchOpenInterestChange4h(symbol);
        const oi = await dataFetcher.fetchOpenInterest(symbol);
        if (oi !== null) oiText = `${oi.toString()} (${oiChange})`;

        const btcActiveTrades = currentlyActiveTrades.filter(t => t.symbol.includes("BTC"));
        if (!symbol.includes("BTC") && btcActiveTrades.length > 0) {
           const btcTrade = btcActiveTrades[0];
           if (signal.direction === btcTrade.direction && btcCorrVal > 0.65) {
              console.log(`Saltando ${symbol} por alta correlación (${btcCorrStr}) con BTC (mira misma dirección).`);
              continue;
           }
        }

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
        
        // Kill Switches separados dinámicamente según el step
        const gridSL = signal.direction === "LONG" ? (lowerPrice - stepSize) : (upperPrice + stepSize);
        const gridTP = signal.direction === "LONG" ? (upperPrice + stepSize) : (lowerPrice - stepSize);
        
        const displayStepPct = (stepPct * 100).toFixed(2) + "%";

        const fmt = (n: number) => n < 0.1 ? n.toFixed(6) : n.toFixed(4);

        const inserted = await db.insert(signalHistory).values({
          symbol, timeframe: "15m", direction: signal.direction,
          entry: fmt(signal.entry), stopLoss: fmt(signal.stopLoss), takeProfit: fmt(signal.takeProfit),
          regime: signal.regime, bias4h: bias4h, strategy: signal.strategy, atr: fmt(currentAtr),
          volumeFilter: signal.volumeFilter, fundingRate: fundingRateText, openInterest: oiText, btcCorrelation: btcCorrStr, btcRegime: btcRegimeStr,
          volumeRank: rank,
          decision: null, // Pendiente
          accountBalance: currentBinanceBalance.toFixed(2),
          numGrids: numGrids,
          gridStep: displayStepPct,
          gridSL: fmt(gridSL),
          gridTP: fmt(gridTP)
        }).returning({ id: signalHistory.id });
        
        signal.symbol = symbol;
        signal.timeframe = timeframe;
        const signalId = inserted[0].id;

        let strat4Warning = "";
        if (strat4Inverted) {
          strat4Warning = `🩸 <b>ESTRATEGIA 4 (LIQUIDITY HUNTER):</b> La masa está sobre-apalancada equivocadamente (FR: ${fundingRateText}). ¡Hemos INVERTIDO la dirección para cazar sus Stop Loss junto al Market Maker!\n\n`;
        }

        let macroWarningStr = "";
        if (wasInverted && !strat4Inverted) {
          macroWarningStr = `🔥 <b>ESTRATEGIA 3 (MACRO BREAKOUT):</b> El bot detectó un setup técnico en contra, pero como Bitcoin está fuertemente <b>${macroTrendWarning}</b> en 1D y 4H, ¡hemos <b>INVERTIDO</b> la señal para cazar la ruptura!\n\n`;
        } else if (macroTrendWarning === "ALCISTA" && signal.direction === "SHORT") {
           if (btcCorrVal < 0) {
              macroWarningStr = `⚠️ <b>Riesgo Macro mitigado:</b> BTC está ALCISTA, pero esta moneda tiene CORRELACIÓN NEGATIVA (${btcCorrStr}). Se respeta el SHORT original.\n\n`;
           } else {
              macroWarningStr = `⚠️ <b>Riesgo Macro (VETO):</b> BTC está ALCISTA en 1D, pero no hay fuerza en 4H. No se invirtió la señal. Hacer SHORT es riesgoso.\n\n`;
           }
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "LONG") {
           if (btcCorrVal < 0) {
              macroWarningStr = `⚠️ <b>Riesgo Macro mitigado:</b> BTC está BAJISTA, pero esta moneda tiene CORRELACIÓN NEGATIVA (${btcCorrStr}). Se respeta el LONG original.\n\n`;
           } else {
              macroWarningStr = `⚠️ <b>Riesgo Macro (VETO):</b> BTC está BAJISTA en 1D, pero no hay fuerza en 4H. No se invirtió la señal. Hacer LONG es riesgoso.\n\n`;
           }
        } else if (macroTrendWarning === "ALCISTA" && signal.direction === "LONG") {
          macroWarningStr = `✅ <b>Alineación Macro:</b> BTC está fuertemente ALCISTA en el gráfico diario. ¡Esta operación sigue la tendencia a favor de las ballenas!\n\n`;
        } else if (macroTrendWarning === "BAJISTA" && signal.direction === "SHORT") {
          macroWarningStr = `✅ <b>Alineación Macro:</b> BTC está fuertemente BAJISTA en el gráfico diario. ¡Esta operación sigue la tendencia a favor de las ballenas!\n\n`;
        }

        const cleanSymbolTV = symbol.split(":")[0].replace("/", "");
        const tvLink = `https://www.tradingview.com/chart/?symbol=BINANCE:${cleanSymbolTV}.P`;

        const msg = `🚨 <b>NUEVA SEÑAL ENCONTRADA (Sniper)</b> 🚨\n\n` +
          `🪙 <b>Par:</b> <a href="${tvLink}">${signal.symbol}</a> (Top #${rank})\n` +
          `📈 <b>Dirección:</b> ${signal.direction}\n` +
          `⏳ <b>Temporalidad:</b> ${signal.timeframe}\n` +
          `📏 <b>Estrategia:</b> ${signal.regime} (Est. ${signal.strategy})\n` +
          `💵 <b>Precio Actual:</b> $${fmt(signal.entry)}\n` +
          `💼 <b>Tu Balance Binance:</b> $${currentBinanceBalance.toFixed(2)} USDT\n\n` +
          `🎯 <b>ZONA DE VOLATILIDAD (ATR):</b>\n` +
          `👇 <b>Banda Inferior:</b> $${fmt(lowerPrice)}\n` +
          `👆 <b>Banda Superior:</b> $${fmt(upperPrice)}\n` +
          `🧮 <b>Tamaño del paso (ATR):</b> ${displayStepPct}\n\n` +
          `🛑 <b>ÓRDENES OCO AUTOMÁTICAS (Sniper):</b>\n` +
          `🩸 <b>Stop Loss:</b> $${fmt(gridSL)}\n` +
          `🏆 <b>Take Profit:</b> $${fmt(gridTP)}\n\n` +
          `💰 <b>Funding:</b> ${fundingRateText} | 📈 <b>OI:</b> ${oiText}\n` +
          (btcCorrStr !== "N/A" ? `🔗 <b>Corr BTC:</b> ${btcCorrStr} | 👑 <b>BTC:</b> ${btcRegimeStr}\n\n` : "\n\n") +
          macroWarningStr +
          strat4Warning +
          `💡 <i>Motivo: ${signal.reason}</i>\n` +
          `⏱ <b>Acción:</b> Tienes ~3 min para analizar. Si apruebas, crea el Grid a mercado.`;

        for (const user of activeUsers) {
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

  // Si llegamos hasta aquí y no se generó NINGUNA señal, avisamos
  if (signalsFound === 0) {
    for (const user of activeUsers) {
      await bot.telegram.sendMessage(
        user.chatId, 
        `⏳ <b>[${timeframe}] Ciclo Completado - Sin Operaciones</b>\nNinguna de las monedas cumple con todos los filtros de la estrategia en este momento. Sigo vigilando... 👀`, 
        { parse_mode: "HTML" }
      );
    }
  }
}

export async function handler15m() { await runAnalysis("15m"); }
