import ccxt from "ccxt";
import { Resource } from "sst";

export class Trader {
  private exchange: ccxt.binance;

  constructor() {
    const binanceKey = process.env.BINANCE_API_KEY || (Resource as any).BINANCE_API_KEY?.value;
    const binanceSecret = process.env.BINANCE_API_SECRET || (Resource as any).BINANCE_API_SECRET?.value;
    const secretKey = binanceSecret ? binanceSecret.replace(/\\n/g, '\n') : "";

    this.exchange = new ccxt.binance({
      apiKey: binanceKey,
      secret: secretKey,
      enableRateLimit: true,
      options: {
        defaultType: 'future',
      },
    });
  }

  async executeTrade(symbol: string, direction: string, stopLossPrice: number, takeProfitPrice: number): Promise<string> {
    try {
      await this.exchange.loadMarkets();
      const market = this.exchange.markets[symbol];

      if (!market) return `❌ Mercado ${symbol} no encontrado.`;

      // 1. Get Balance
      const balance = await this.exchange.fetchBalance();
      const usdtBalance = balance.total['USDT'] || 0;
      if (usdtBalance <= 0) return "❌ Balance insuficiente.";

      // 2. Arriesgar el 20% del balance (Monto Invertido = Margen)
      const marginToInvest = usdtBalance * 0.20;

      // 3. Obtener el mínimo Notional real de la moneda y forzar un piso de 10 USDT
      const exchangeMinNotional = market.limits.cost?.min || 5.0;
      const targetNotional = Math.max(10.0, exchangeMinNotional);

      // 4. Calcular Apalancamiento para llegar al targetNotional
      let leverage = 1;
      let notional = marginToInvest;

      while (notional < targetNotional && leverage < 10) {
        leverage++;
        notional = marginToInvest * leverage;
      }

      if (notional < targetNotional) {
         return `❌ Descartada automáticamente: Capital muy bajo ($${marginToInvest.toFixed(2)} USDT). Incluso con apalancamiento máximo permitido (x10), el tamaño de la posición ($${notional.toFixed(2)}) no supera el mínimo requerido por nuestra regla/Binance ($${targetNotional.toFixed(2)}).`;
      }

      // 5. Configurar el Apalancamiento en Binance
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e: any) {
        console.warn("⚠️ Warning setting leverage:", e.message);
      }

      // 6. Configurar modo Isolated (aislado) para no comprometer todo el capital si hay mechazo
      try {
        await this.exchange.setMarginMode('isolated', symbol);
      } catch (e: any) {
        // A veces falla si ya estaba en isolated, lo ignoramos
      }

      // 7. Calcular Amount en Tokens
      const currentTicker = await this.exchange.fetchTicker(symbol);
      const currentPrice = currentTicker.last!;
      
      let amount = notional / currentPrice;
      const amountPrecision = market.precision.amount;
      amount = parseFloat(this.exchange.decimalToPrecision(amount, this.exchange.TRUNCATE, amountPrecision, this.exchange.DECIMAL_PLACES));

      if (amount <= 0) return "❌ Cantidad calculada de tokens es 0 (precisión del exchange).";

      // 8. EJECUTAR ORDEN PRINCIPAL A MERCADO
      const side = direction === "LONG" ? "buy" : "sell";
      await this.exchange.createMarketOrder(symbol, side, amount);
      
      // 9. COLOCAR ORDENES DE SALIDA (STOP LOSS Y TAKE PROFIT)
      const oppositeSide = side === "buy" ? "sell" : "buy";

      // Usar closePosition o reduceOnly asegura que al dispararse, se cierre la posición
      // Si la posición ya se cerró, esta orden falla en dispararse (no genera huérfanos activos).
      try {
        await this.exchange.createOrder(symbol, 'STOP_MARKET', oppositeSide, amount, undefined, {
            stopPrice: stopLossPrice,
            closePosition: true,
            timeInForce: 'GTC'
        });
      } catch(e: any) {
        console.error("Error colocando SL:", e.message);
      }

      try {
        await this.exchange.createOrder(symbol, 'TAKE_PROFIT_MARKET', oppositeSide, amount, undefined, {
            stopPrice: takeProfitPrice,
            closePosition: true,
            timeInForce: 'GTC'
        });
      } catch(e: any) {
        console.error("Error colocando TP:", e.message);
      }

      return `✅ <b>TRADE EJECUTADO EN BINANCE</b>\n💰 Inversión (Margen): $${marginToInvest.toFixed(2)} USDT\n⚙️ Apalancamiento: x${leverage}\n📈 Posición Total: $${notional.toFixed(2)} USDT\n🪙 Cantidad: ${amount} tokens\n🛑 SL: $${stopLossPrice}\n🏆 TP: $${takeProfitPrice}`;

    } catch (error: any) {
      console.error("Execute Trade Error:", error);
      return `❌ Error Fatal: ${error.message}`;
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
}
