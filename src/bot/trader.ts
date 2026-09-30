import ccxt from "ccxt";
import { Resource } from "sst";

export type TradeStatus = "ejecutado" | "rechazado" | "advertencia" | "critico";

export interface TradeResult {
  status: TradeStatus;
  mensaje: string;
}

const EXIT_ORDER_MAX_ATTEMPTS = 3; // 1 intento + 2 reintentos
const EXIT_ORDER_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Binance: "-20132 The client algo id is duplicated" — el SL/TP (algoOrder) con ese
// clientOrderId ya está puesto en el exchange, probablemente por un intento anterior cuya
// respuesta se perdió por timeout de red. Se chequea el código exacto, no la clase de error
// de ccxt (BadRequest también cubre otros -20xxx que sí son fallos reales).
function isDuplicateClientOrderId(error: any): boolean {
  return typeof error?.message === "string" && error.message.includes('"code":-20132');
}

function buildClientOrderId(prefix: "sl" | "tp", symbol: string, ts: number): string {
  return `${prefix}_${symbol.replace(/[^A-Za-z0-9]/g, "")}_${ts.toString(36)}`;
}

export class Trader {
  private exchange: any;

  constructor(apiKey?: string, apiSecret?: string) {
    // Si pasamos un apiKey, usamos SIEMPRE ese (incluso si apiSecret es vacío), para evitar cruzar llaves.
    const binanceKey = apiKey !== undefined ? apiKey : (process.env.BINANCE_API_KEY || (Resource as any).BINANCE_API_KEY?.value);
    const binanceSecret = apiKey !== undefined ? (apiSecret || "") : (process.env.BINANCE_API_SECRET || (Resource as any).BINANCE_API_SECRET?.value);
    const secretKey = binanceSecret ? binanceSecret.replace(/\\n/g, '\n') : "";

    this.exchange = new (ccxt as any).binance({
      apiKey: binanceKey,
      secret: secretKey,
      enableRateLimit: true,
      options: {
        defaultType: 'future',
        fetchOpenOrders: {
          warnWithoutSymbol: false
        }
      },
    });
  }

  async getFreeBalance(): Promise<number> {
    try {
      if (!this.exchange.apiKey) return 0;
      const balance = await this.exchange.fetchBalance();
      const val = balance.free['USDT'];
      return typeof val === 'number' ? val : parseFloat(val || '0');
    } catch(e) {
      console.error("Error fetching free balance:", e);
      return 0;
    }
  }

  // Coloca un SL o TP (STOP_MARKET/TAKE_PROFIT_MARKET) con reintentos. El clientOrderId se genera
  // UNA vez antes del primer intento y se reusa en todos los reintentos: si un intento anterior
  // llegó a Binance pero se perdió la respuesta por timeout, el reintento no duplica la orden,
  // Binance lo rechaza con -20132 y eso se interpreta como éxito (ver isDuplicateClientOrderId).
  private async placeExitOrderWithRetries(
    symbol: string,
    type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET',
    oppositeSide: string,
    amount: number,
    triggerPrice: number,
    clientOrderId: string
  ): Promise<{ ok: boolean; lastError?: any }> {
    for (let attempt = 1; attempt <= EXIT_ORDER_MAX_ATTEMPTS; attempt++) {
      try {
        await this.exchange.createOrder(symbol, type, oppositeSide, amount, undefined, {
          stopPrice: triggerPrice,
          closePosition: true,
          timeInForce: 'GTC',
          clientOrderId,
        });
        return { ok: true };
      } catch (e: any) {
        if (isDuplicateClientOrderId(e)) {
          return { ok: true };
        }
        console.error(`Error colocando ${type} (intento ${attempt}/${EXIT_ORDER_MAX_ATTEMPTS}):`, e.message);
        if (attempt < EXIT_ORDER_MAX_ATTEMPTS) {
          await sleep(EXIT_ORDER_RETRY_DELAY_MS);
          continue;
        }
        return { ok: false, lastError: e };
      }
    }
    return { ok: false };
  }

  // Se llama cuando el SL agotó los reintentos: consulta la posición real (no el amount calculado,
  // por si hubo slippage) y la cierra a mercado con reduceOnly. Siempre barre después las órdenes
  // que hayan quedado abiertas para el símbolo (regulares Y algo orders — cancelAllOrders por
  // default NO cubre las algo orders en Binance Futures, hace falta el flag `trigger`).
  private async emergencyClose(symbol: string, oppositeSide: string): Promise<boolean> {
    let closed = false;
    try {
      const positions = await this.exchange.fetchPositions([symbol]);
      const pos = positions.find((p: any) => p.symbol === symbol && p.contracts && p.contracts > 0);
      if (!pos) {
        // Ya no hay posición abierta (se cerró por otro lado): no hay nada que cerrar.
        closed = true;
      } else {
        await this.exchange.createMarketOrder(symbol, oppositeSide, pos.contracts, { reduceOnly: true });
        closed = true;
      }
    } catch (e: any) {
      console.error("Error en el cierre de emergencia:", e.message);
      closed = false;
    }

    await this.exchange.cancelAllOrders(symbol).catch((e: any) => console.error("Error cancelando órdenes regulares:", e.message));
    await this.exchange.cancelAllOrders(symbol, { trigger: true }).catch((e: any) => console.error("Error cancelando algo orders:", e.message));

    return closed;
  }

  async executeTrade(symbol: string, direction: string, stopLossPrice: number, takeProfitPrice: number, configuredMargin: number = 25.0, leverageMin: number = 1, leverageMax: number = 2): Promise<TradeResult> {
    try {
      // 0. Validar la configuración de apalancamiento antes de tocar el exchange (RULES.md invariante:
      // nunca operar por encima de leverageMax, ni siquiera si leverageMin ya lo supera).
      if (leverageMin > leverageMax) {
        return { status: "rechazado", mensaje: `❌ Configuración inválida: el apalancamiento mínimo (x${leverageMin}) no puede ser mayor que el máximo (x${leverageMax}). Corregí la configuración antes de operar.` };
      }

      await this.exchange.loadMarkets();
      const market = this.exchange.markets[symbol];

      if (!market) return { status: "rechazado", mensaje: `❌ Mercado ${symbol} no encontrado.` };

      // 1. Validar balance (RULES.md Regla 2)
      const balance = await this.exchange.fetchBalance();
      const usdtVal = balance.free['USDT'];
      const usdtBalance = typeof usdtVal === 'number' ? usdtVal : parseFloat(usdtVal || '0');

      if (usdtBalance < configuredMargin) {
         return { status: "rechazado", mensaje: `❌ Balance insuficiente. Tienes $${usdtBalance.toFixed(2)} USDT, pero tu configuración requiere $${configuredMargin.toFixed(2)} USDT por operación.` };
      }

      const marginToInvest = configuredMargin;

      // 2. Obtener el mínimo Notional real de la moneda
      const exchangeMinNotional = market.limits.cost?.min || 5.0;
      const targetNotional = Math.max(10.0, exchangeMinNotional);

      // 3. Escalado de apalancamiento (RULES.md Regla 1)
      // Empieza en leverageMin, sube hasta leverageMax si el notional no alcanza
      let leverage = leverageMin;
      let notional = marginToInvest * leverage;

      while (notional < targetNotional && leverage < leverageMax) {
        leverage++;
        notional = marginToInvest * leverage;
      }

      if (notional < targetNotional) {
         return { status: "rechazado", mensaje: `❌ Capital insuficiente incluso con apalancamiento máximo (x${leverageMax}). Notional proyectado: $${notional.toFixed(2)} USDT, mínimo requerido: $${targetNotional.toFixed(2)} USDT. Sube tu margen o tu apalancamiento máximo en la configuración.` };
      }

      // 5. Configurar el Apalancamiento en Binance. Si falla, abortamos: no tiene sentido colocar
      // la orden con el leverage que sea que ya tuviera la cuenta (A7 — nunca confirmado).
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e: any) {
        return { status: "rechazado", mensaje: `❌ No se pudo confirmar el apalancamiento (x${leverage}) en Binance. No se colocó ninguna orden. Detalle: ${e.message}` };
      }

      // 6. Configurar modo Isolated (aislado). ccxt ya resuelve en silencio el caso "ya estaba en
      // isolated" (Binance -4046), así que cualquier error que llegue acá es real (A8 — nunca
      // confirmado, no arriesgamos quedar en margen cruzado).
      try {
        await this.exchange.setMarginMode('isolated', symbol);
      } catch (e: any) {
        return { status: "rechazado", mensaje: `❌ No se pudo confirmar el modo de margen aislado en Binance. No se colocó ninguna orden. Detalle: ${e.message}` };
      }

      // 7. Calcular Amount en Tokens
      const currentTicker = await this.exchange.fetchTicker(symbol);
      const currentPrice = currentTicker.last!;

      let amount = notional / currentPrice;
      amount = parseFloat(this.exchange.amountToPrecision(symbol, amount));

      if (amount <= 0) return { status: "rechazado", mensaje: "❌ Cantidad calculada de tokens es 0 (precisión del exchange)." };

      // 8. EJECUTAR ORDEN PRINCIPAL A MERCADO
      const side = direction === "LONG" ? "buy" : "sell";
      await this.exchange.createMarketOrder(symbol, side, amount);

      // 9. COLOCAR ORDENES DE SALIDA (STOP LOSS Y TAKE PROFIT), con reintentos.
      const oppositeSide = side === "buy" ? "sell" : "buy";
      const attemptTs = Date.now();

      const resumen = `💰 Inversión (Margen): $${marginToInvest.toFixed(2)} USDT\n⚙️ Apalancamiento: x${leverage}\n📈 Posición Total: $${notional.toFixed(2)} USDT\n🪙 Cantidad: ${amount} tokens\n🎯 Precio Entrada: $${currentPrice}\n🛑 SL: $${stopLossPrice}\n🏆 TP: $${takeProfitPrice}`;

      const slResult = await this.placeExitOrderWithRetries(
        symbol, 'STOP_MARKET', oppositeSide, amount, stopLossPrice, buildClientOrderId("sl", symbol, attemptTs)
      );

      if (!slResult.ok) {
        // El SL no se pudo confirmar: no dejamos una posición apalancada sin ningún stop.
        const closed = await this.emergencyClose(symbol, oppositeSide);
        if (closed) {
          return {
            status: "advertencia",
            mensaje: `⚠️ <b>POSICIÓN CERRADA POR FALLA DE PROTECCIÓN</b>\nNo se pudo colocar el Stop Loss tras varios intentos, así que la posición se cerró a mercado por seguridad. No queda exposición abierta, pero hay que revisar por qué falló el Stop Loss.\n${resumen}`,
          };
        }
        return {
          status: "critico",
          mensaje: `🚨 <b>POSICIÓN ABIERTA SIN PROTECCIÓN — ACCIÓN MANUAL URGENTE</b>\nNo se pudo colocar el Stop Loss ni cerrar la posición a mercado. Hay ${amount} de ${symbol} abierto sin ningún stop. Cerrala manualmente en Binance ahora mismo.\n${resumen}`,
        };
      }

      const tpResult = await this.placeExitOrderWithRetries(
        symbol, 'TAKE_PROFIT_MARKET', oppositeSide, amount, takeProfitPrice, buildClientOrderId("tp", symbol, attemptTs)
      );

      if (!tpResult.ok) {
        return {
          status: "advertencia",
          mensaje: `⚠️ <b>TRADE EJECUTADO SIN TAKE PROFIT</b>\nEl Take Profit no se pudo colocar tras varios intentos. La posición sigue protegida por el Stop Loss. Hay que colocar el TP manualmente.\n${resumen}`,
        };
      }

      return { status: "ejecutado", mensaje: `✅ <b>TRADE EJECUTADO EN BINANCE</b>\n${resumen}` };

    } catch (error: any) {
      console.error("Execute Trade Error:", error);
      return { status: "rechazado", mensaje: `❌ Error Fatal: ${error.message}` };
    }
  }

  // Rutina de limpieza de huérfanos
  async cleanOrphanOrders() {
    try {
      const positions = await this.exchange.fetchPositions();
      // Mapeo rápido de monedas que SÍ tienen una posición activa
      const activeSymbols = new Set(
        positions.filter((p: any) => p.contracts && p.contracts > 0).map((p: any) => p.symbol)
      );

      const openOrders = await this.exchange.fetchOpenOrders();
      let cleaned = 0;

      for (const order of openOrders) {
        // Si hay una orden límite de Stop/TP pero la posición ya NO existe, es huérfana
        if (!activeSymbols.has(order.symbol)) {
           // Chequear que sea de cierre para no cancelar órdenes de compra limit pendientes de entrada
           if (order.reduceOnly || order.info?.closePosition === 'true' || order.type.includes('STOP') || order.type.includes('TAKE_PROFIT')) {
               await this.exchange.cancelOrder(order.id, order.symbol).catch(() => {});
               cleaned++;
           }
        }
      }
      if (cleaned > 0) {
        console.log(`🧹 Limpieza: ${cleaned} órdenes huérfanas eliminadas en Binance.`);
      }
    } catch (e) {
      console.error("Error limpiando huérfanos:", e);
    }
  }

  async getTradeRealizedPnl(symbol: string, sinceMs: number): Promise<{ pnl: number, fee: number, entryPrice?: number, exitPrice?: number }> {
    try {
      const trades = await this.exchange.fetchMyTrades(symbol.replace(":USDT", ""), sinceMs, 100);
      let totalPnl = 0;
      let totalFee = 0;
      for (const t of trades) {
        if (t.info && t.info.realizedPnl) {
            totalPnl += parseFloat(t.info.realizedPnl);
        }
        if (t.fee && t.fee.cost) {
            totalFee += t.fee.cost;
        }
      }

      const entryPrice = trades.length > 0 ? trades[0].price : undefined;
      const exitPrice = trades.length > 0 ? trades[trades.length - 1].price : undefined;

      return { pnl: totalPnl, fee: totalFee, entryPrice, exitPrice };
    } catch(e) {
      console.error(`Error obteniendo PnL real para ${symbol}:`, e);
      return { pnl: 0, fee: 0 };
    }
  }
}
