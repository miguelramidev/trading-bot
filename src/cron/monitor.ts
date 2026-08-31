import { Telegraf } from "telegraf";
import { db } from "../db/index.js";
import { signalHistory, userConfig } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import ccxt from "ccxt";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

export async function handler() {
  console.log("Iniciando monitor de posiciones para Breakeven...");

  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    console.log("No hay API Keys de Binance configuradas. Abortando monitor.");
    return;
  }

  // 1. Obtener señales activas en DB que aún no han movido su SL
  const activeSignals = await db.query.signalHistory.findMany({
    where: and(
      eq(signalHistory.isActiveTrade, true),
      eq(signalHistory.breakevenMoved, false)
    )
  });

  if (activeSignals.length === 0) {
    console.log("No hay operaciones activas pendientes de breakeven.");
    return;
  }

  try {
    const exchange = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_API_SECRET,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });

    await exchange.loadMarkets();

    // 2. Obtener todas las posiciones abiertas en Binance
    const positions = await exchange.fetchPositions();
    const openPositions = positions.filter(p => p.contracts && p.contracts > 0);

    const users = await db.query.userConfig.findMany();
    const activeUsers = users.filter(u => !u.isPaused);

    // 3. Evaluar cada señal
    for (const signal of activeSignals) {
      const position = openPositions.find(p => p.symbol === signal.symbol);

      if (!position) {
        const openOrders = await exchange.fetchOpenOrders(signal.symbol);
        const limitOrder = openOrders.find(o => o.type === 'limit');

        if (!limitOrder) {
          console.log(`[${signal.symbol}] Ya no hay posición ni orden Limit. Marcando inactiva.`);
          await db.update(signalHistory)
            .set({ isActiveTrade: false })
            .where(eq(signalHistory.id, signal.id));
        } else {
          console.log(`[${signal.symbol}] Orden Limit aún esperando entrada.`);
        }
        continue;
      }

      const markPrice = position.markPrice;
      if (!markPrice) continue;

      const breakevenTarget = parseFloat(signal.breakevenTarget || "0");
      const entryPrice = parseFloat(signal.entry || "0");
      if (!breakevenTarget || !entryPrice) continue;

      const isLong = signal.direction === "LONG";
      let crossedBreakeven = false;

      if (isLong && markPrice >= breakevenTarget) {
        crossedBreakeven = true;
      } else if (!isLong && markPrice <= breakevenTarget) {
        crossedBreakeven = true;
      }

      if (crossedBreakeven) {
        console.log(`[${signal.symbol}] ¡Cruce de Breakeven detectado! Moviendo Stop Loss...`);

        const openOrders = await exchange.fetchOpenOrders(signal.symbol);
        const stopOrders = openOrders.filter(o => o.type === 'stop_market' || o.type === 'stop');
        
        for (const order of stopOrders) {
          try {
            await exchange.cancelOrder(order.id, signal.symbol);
          } catch (e) {
            console.error(`Error cancelando orden SL ${order.id}:`, e);
          }
        }

        const amount = position.contracts || 0;
        const oppositeSide = isLong ? "sell" : "buy";
        
        // Calcular el Breakeven Real (Comisiones de Binance: 0.02% Maker Entrada + 0.05% Taker Salida = ~0.07%)
        // Le damos un buffer de 0.08% para asegurar $0 de pérdida o ganancia marginal
        const feeBuffer = 0.0008; 
        let trueBreakevenPrice = isLong 
          ? entryPrice * (1 + feeBuffer) 
          : entryPrice * (1 - feeBuffer);

        try {
          if (amount > 0) {
            // Ajustamos precisión del precio de stop según el mercado
            await exchange.loadMarkets();
            const market = exchange.markets[signal.symbol];
            if (market) {
              trueBreakevenPrice = parseFloat(exchange.priceToPrecision(signal.symbol, trueBreakevenPrice));
            }

            await exchange.createOrder(signal.symbol, 'STOP_MARKET', oppositeSide, amount, undefined, {
              stopPrice: trueBreakevenPrice,
              reduceOnly: true
            });
          }
          
          await db.update(signalHistory)
            .set({ breakevenMoved: true })
            .where(eq(signalHistory.id, signal.id));

          const msg = `🛡️ <b>¡Protección Activada (Comisiones Cubiertas)!</b>\n\n` +
                      `🪙 Par: ${signal.symbol}\n` +
                      `📈 El precio cruzó tu meta de seguridad.\n` +
                      `✅ El Stop Loss se movió a <b>${trueBreakevenPrice}</b> (Incluye ~0.08% para cubrir comisiones Maker/Taker).\n\n` +
                      `<i>Riesgo absoluto = $0.</i>`;

          for (const u of activeUsers) {
            await bot.telegram.sendMessage(u.chatId, msg, { parse_mode: "HTML" });
          }

        } catch (e: any) {
          console.error(`Error creando nuevo SL a breakeven para ${signal.symbol}:`, e);
        }
      } else {
        console.log(`[${signal.symbol}] Monitoreando. Precio actual: ${markPrice}, Meta Breakeven: ${breakevenTarget}`);
      }
    }

  } catch (error) {
    console.error("Error en monitor de Breakeven:", error);
  }
}
