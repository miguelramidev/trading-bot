// Clasificación de las órdenes de protección (SL/TP) reales en Binance de
// una posición abierta. Separado del controller para poder testearlo sin
// ccxt real (ver dashboardHelpers.ts para el mismo patrón).
//
// No se confía en `order.type`: para futuros USDM, ccxt colapsa tanto
// STOP_MARKET como TAKE_PROFIT_MARKET al mismo `type: "market"` normalizado
// (`parseOrderTypeByMarket` en ccxt 4.5.76, node_modules/ccxt/js/src/binance.js:6194-6215).
// Por eso se clasifica por estructura: lado de la orden (opuesto a la
// posición), si reduce/cierra la posición, y de qué lado de la entrada
// dispara — igual para LONG y SHORT sin ramas redundantes.

/** Shape mínimo que necesitamos de un Order normalizado por ccxt. */
export interface NormalizedOrder {
  side: string | null | undefined;
  reduceOnly?: boolean | null;
  triggerPrice?: number | null;
  status?: string | null;
  info?: { closePosition?: string | boolean } & Record<string, unknown>;
}

export interface ProtectionOrderInfo {
  price: number;
  status: string;
}

export interface ProtectionClassification {
  stopLoss: ProtectionOrderInfo | null;
  /** false también cuando hay ambigüedad — nunca se reporta un SL "activo" sin estar seguros. */
  hasStopLoss: boolean;
  /** Por qué `hasStopLoss` es false. `null` cuando sí se encontró. */
  stopLossReason: string | null;
  takeProfit: ProtectionOrderInfo | null;
}

function isReduceOrClose(order: NormalizedOrder): boolean {
  if (order.reduceOnly === true) return true;
  const closePosition = order.info?.closePosition;
  return closePosition === true || closePosition === "true";
}

export function classifyProtectionOrders({
  orders,
  isLong,
  entryPrice,
}: {
  orders: NormalizedOrder[];
  isLong: boolean;
  entryPrice: number;
}): ProtectionClassification {
  const exitSide = isLong ? "sell" : "buy";

  // Candidatas: del lado que cerraría la posición, que reducen/cierran, y con un disparador real (>0).
  const candidates = orders.filter((o) => {
    const trigger = typeof o.triggerPrice === "number" ? o.triggerPrice : null;
    return o.side === exitSide && isReduceOrClose(o) && trigger !== null && trigger > 0;
  });

  // SL: dispara del lado adverso a la entrada. TP: dispara del lado favorable.
  // Misma fórmula para LONG y SHORT — el signo de la comparación se invierte solo.
  const slCandidates = candidates.filter((o) => (isLong ? o.triggerPrice! < entryPrice : o.triggerPrice! > entryPrice));
  const tpCandidates = candidates.filter((o) => (isLong ? o.triggerPrice! > entryPrice : o.triggerPrice! < entryPrice));

  let stopLoss: ProtectionOrderInfo | null = null;
  let stopLossReason: string | null = null;
  if (slCandidates.length === 1) {
    stopLoss = { price: slCandidates[0].triggerPrice!, status: slCandidates[0].status ?? "open" };
  } else if (slCandidates.length === 0) {
    stopLossReason = "No se encontró ninguna orden de stop loss en Binance para esta posición.";
  } else {
    stopLossReason = "Se encontraron varias órdenes candidatas a stop loss: no se puede confirmar cuál está activa.";
  }

  const takeProfit: ProtectionOrderInfo | null =
    tpCandidates.length === 1 ? { price: tpCandidates[0].triggerPrice!, status: tpCandidates[0].status ?? "open" } : null;

  return { stopLoss, hasStopLoss: stopLoss !== null, stopLossReason, takeProfit };
}

// Símbolo unificado de ccxt, ej. "ENA/USDT:USDT" o "BTC/USDT". Se valida antes
// de mandarlo a ccxt/Binance (viene de un query param del cliente).
const CCXT_SYMBOL_PATTERN = /^[A-Z0-9]{1,20}\/[A-Z0-9]{1,10}(:[A-Z0-9]{1,10})?$/;

export function isValidCcxtSymbol(symbol: string): boolean {
  return CCXT_SYMBOL_PATTERN.test(symbol);
}
