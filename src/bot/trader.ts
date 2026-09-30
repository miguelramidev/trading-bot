import ccxt from "ccxt";
import { Resource } from "sst";

export type TradeStatus = "ejecutado" | "rechazado" | "advertencia" | "critico";

export interface TradeResult {
  status: TradeStatus;
  mensaje: string;
}

const EXIT_ORDER_MAX_ATTEMPTS = 3; // 1 intento + 2 reintentos
const EXIT_ORDER_RETRY_DELAY_MS = 800;

// ROADMAP.md hallazgo A10: el Stop Loss se calcula como 1×ATR(15m) desde el precio de la
// señal, sin piso mínimo — para activos de precio alto (BTC) o momentáneamente poco
// volátiles (TRX) puede quedar a una fracción de % del precio, más ajustado que la propia
// comisión de entrada+salida. 0.5% ≈ 5x la comisión taker ida y vuelta estimada (0.05% x2 =
// 0.10%), para que el SL no salte con ruido normal de mercado sin margen real de protección.
const MIN_SL_DISTANCE_PCT = 0.005;

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

// Los errores de ccxt para Binance traen el código y el texto embebidos en el mensaje
// (ej. `binance {"code":-4046,"msg":"No need to change margin type."}`). Se extraen para
// mostrarle al usuario un mensaje legible sin depender del formato crudo de ccxt; si no
// matchea (error de red, error que no vino de Binance, etc.), cae en el mensaje completo tal cual.
// Texto plano, sin escapar: `mensaje` lo consumen tanto Telegram (HTML) como la API de Flutter
// (texto plano) — quien necesite HTML seguro lo escapa en su propia capa de entrega, nunca acá
// (si escapáramos acá, Flutter mostraría "&lt;" literal en vez del texto real).
function extractBinanceError(e: any): { code: string; msg: string } {
  const raw = typeof e?.message === "string" ? e.message : String(e);
  const match = raw.match(/"code":(-?\d+).*?"msg":"([^"]*)"/);
  return match ? { code: match[1], msg: match[2] } : { code: "desconocido", msg: raw };
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
        },
        // A8: por default, ccxt 4.5.76 RELANZA la excepción MarginModeAlreadySet en vez de
        // tragarla (node_modules/ccxt/.../binance.js: 'setMarginMode': { throwMarginModeAlreadySet: true }
        // en las opciones base) — a pesar de que el propio código de ccxt comenta "not an error".
        // Esto restaura el comportamiento que el resto del código siempre asumió: si el par ya
        // está en isolated, no es un fallo real. El catch de setMarginMode más abajo además
        // confirma el modo real contra Binance antes de rechazar, por si esto no alcanza.
        setMarginMode: {
          throwMarginModeAlreadySet: false
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
      // la orden con el leverage que sea que ya tuviera la cuenta (A7). A diferencia de A8, acá
      // sí se revisó con rigor el código de ccxt 4.5.76: setLeverage() no tiene ninguna opción
      // tipo "ya seteado, no relanzar" (no existe un equivalente a throwMarginModeAlreadySet para
      // leverage) — Binance simplemente no rechaza `POST /fapi/v1/leverage` cuando el valor ya es
      // el mismo, así que cualquier excepción acá es un fallo real, sin necesidad de confirmación
      // adicional como en A8.
      try {
        await this.exchange.setLeverage(leverage, symbol);
      } catch (e: any) {
        return { status: "rechazado", mensaje: `❌ No se pudo confirmar el apalancamiento (x${leverage}) en Binance. No se colocó ninguna orden. Detalle: ${e.message}` };
      }

      // 6. Configurar modo Isolated (aislado). A8, confirmado con un caso real (ZEC): ccxt puede
      // relanzar MarginModeAlreadySet incluso con la opción throwMarginModeAlreadySet:false seteada
      // en el constructor (por ejemplo si Binance devuelve el error en un formato que ccxt no
      // reconoce como "ya estaba aislado"), así que no asumimos que cualquier fallo acá signifique
      // que el par está en cruzado: confirmamos el modo real antes de rechazar una operación válida.
      try {
        await this.exchange.setMarginMode('isolated', symbol);
      } catch (e: any) {
        const { code, msg } = extractBinanceError(e);
        console.error(`[executeTrade] setMarginMode('isolated', ${symbol}) falló (código ${code}: ${msg}). Confirmando el modo real antes de decidir.`, e);

        let marginModeInfo: any;
        try {
          marginModeInfo = await this.exchange.fetchMarginMode(symbol);
        } catch (confirmError: any) {
          console.error(`[executeTrade] No se pudo confirmar el modo de margen real de ${symbol}:`, confirmError);
          return {
            status: "rechazado",
            mensaje: `❌ No se pudo confirmar el modo de margen aislado en Binance (código ${code}: ${msg}), y tampoco se pudo verificar el modo real de la cuenta (${confirmError.message}). No se colocó ninguna orden.`,
          };
        }

        if (marginModeInfo?.marginMode !== "isolated") {
          return {
            status: "rechazado",
            mensaje: `❌ El par está en modo "${marginModeInfo?.marginMode ?? "desconocido"}" en Binance, no aislado (código ${code}: ${msg}). No se colocó ninguna orden.`,
          };
        }

        // Confirmado aislado por otra vía (ej. ya lo estaba): el fallo de setMarginMode no bloquea la operación.
        console.error(`[executeTrade] setMarginMode falló pero se confirmó modo isolated para ${symbol}; se continúa con la operación.`);
      }

      // 7. Calcular Amount en Tokens
      const currentTicker = await this.exchange.fetchTicker(symbol);
      const currentPrice = currentTicker.last!;

      let amount = notional / currentPrice;
      amount = parseFloat(this.exchange.amountToPrecision(symbol, amount));

      if (amount <= 0) return { status: "rechazado", mensaje: "❌ Cantidad calculada de tokens es 0 (precisión del exchange)." };

      // 7.5 Validar distancia mínima del SL contra el precio actual (A10 en ROADMAP.md).
      // Antes de abrir ninguna posición: si el SL está demasiado ajustado, la comisión de
      // entrada+salida ya se come el margen de protección sin que haya pasado nada real.
      const slDistancePct = Math.abs(currentPrice - stopLossPrice) / currentPrice;
      if (slDistancePct < MIN_SL_DISTANCE_PCT) {
        return {
          status: "rechazado",
          mensaje: `❌ Stop Loss demasiado ajustado: está a ${(slDistancePct * 100).toFixed(3)}% del precio actual, por debajo del mínimo permitido (${(MIN_SL_DISTANCE_PCT * 100).toFixed(2)}%). No se coloca ninguna orden.`,
        };
      }

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
            mensaje: `⚠️ POSICIÓN CERRADA POR FALLA DE PROTECCIÓN\nNo se pudo colocar el Stop Loss tras varios intentos, así que la posición se cerró a mercado por seguridad. No queda exposición abierta, pero hay que revisar por qué falló el Stop Loss.\n${resumen}`,
          };
        }
        return {
          status: "critico",
          mensaje: `🚨 POSICIÓN ABIERTA SIN PROTECCIÓN — ACCIÓN MANUAL URGENTE\nNo se pudo colocar el Stop Loss ni cerrar la posición a mercado. Hay ${amount} de ${symbol} abierto sin ningún stop. Cerrala manualmente en Binance ahora mismo.\n${resumen}`,
        };
      }

      const tpResult = await this.placeExitOrderWithRetries(
        symbol, 'TAKE_PROFIT_MARKET', oppositeSide, amount, takeProfitPrice, buildClientOrderId("tp", symbol, attemptTs)
      );

      if (!tpResult.ok) {
        return {
          status: "advertencia",
          mensaje: `⚠️ TRADE EJECUTADO SIN TAKE PROFIT\nEl Take Profit no se pudo colocar tras varios intentos. La posición sigue protegida por el Stop Loss. Hay que colocar el TP manualmente.\n${resumen}`,
        };
      }

      return { status: "ejecutado", mensaje: `✅ TRADE EJECUTADO EN BINANCE\n${resumen}` };

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
