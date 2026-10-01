import { describe, it, expect } from "vitest";
import { classifyProtectionOrders, isValidCcxtSymbol, extractTickSize, type NormalizedOrder } from "../src/api/modules/dashboard/infrastructure/protectionOrders.js";

// Fixtures con la forma real que arma `parseOrder` de ccxt 4.5.76 para
// Binance USDM futures (node_modules/ccxt/js/src/binance.js:6864-6886):
// `type` queda colapsado a "market" tanto para STOP_MARKET como para
// TAKE_PROFIT_MARKET (parseOrderTypeByMarket, líneas 6194-6215) — por eso
// estos fixtures deliberadamente NO confían en `type` para distinguirlas.
function algoOrder(overrides: Partial<NormalizedOrder> & { closePosition?: boolean }): NormalizedOrder {
  const { closePosition, ...rest } = overrides;
  return {
    side: "sell",
    reduceOnly: true,
    triggerPrice: null,
    status: "open",
    info: closePosition !== undefined ? { closePosition: String(closePosition) } : {},
    ...rest,
  };
}

describe("classifyProtectionOrders", () => {
  it("LONG: identifica el SL (venta, reduce, dispara por debajo de la entrada) y el TP (por arriba)", () => {
    const orders = [
      algoOrder({ side: "sell", reduceOnly: true, triggerPrice: 95 }), // SL
      algoOrder({ side: "sell", reduceOnly: true, triggerPrice: 110 }), // TP
    ];
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(true);
    expect(result.stopLoss).toEqual({ price: 95, status: "open" });
    expect(result.takeProfit).toEqual({ price: 110, status: "open" });
    expect(result.stopLossReason).toBeNull();
  });

  it("SHORT: el SL dispara por arriba de la entrada y el TP por abajo (lado 'buy')", () => {
    const orders = [
      algoOrder({ side: "buy", reduceOnly: true, triggerPrice: 105 }), // SL
      algoOrder({ side: "buy", reduceOnly: true, triggerPrice: 90 }), // TP
    ];
    const result = classifyProtectionOrders({ orders, isLong: false, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(true);
    expect(result.stopLoss).toEqual({ price: 105, status: "open" });
    expect(result.takeProfit).toEqual({ price: 90, status: "open" });
  });

  it("closePosition=true (sin reduceOnly) también cuenta como orden de protección real", () => {
    const orders = [algoOrder({ side: "sell", reduceOnly: undefined, closePosition: true, triggerPrice: 95 })];
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(true);
    expect(result.stopLoss?.price).toBe(95);
  });

  it("sin ninguna orden de protección -> hasStopLoss false con motivo explícito", () => {
    const result = classifyProtectionOrders({ orders: [], isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
    expect(result.stopLoss).toBeNull();
    expect(result.stopLossReason).toContain("No se encontró");
  });

  it("dos candidatas a SL (ambiguo) -> hasStopLoss false, nunca se reporta un SL sin estar seguros", () => {
    const orders = [
      algoOrder({ side: "sell", reduceOnly: true, triggerPrice: 95 }),
      algoOrder({ side: "sell", reduceOnly: true, triggerPrice: 90 }),
    ];
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
    expect(result.stopLoss).toBeNull();
    expect(result.stopLossReason).toContain("varias órdenes candidatas");
  });

  it("una orden del lado de entrada (no reduce la posición) se ignora, no cuenta como protección", () => {
    const orders = [algoOrder({ side: "buy", reduceOnly: false, triggerPrice: 95 })]; // side de apertura, no de cierre
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
  });

  it("una orden reduceOnly pero del lado equivocado (no cierra esta posición) se ignora", () => {
    const orders = [algoOrder({ side: "buy", reduceOnly: true, triggerPrice: 95 })]; // LONG cierra vendiendo, no comprando
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
  });

  it("orden sin triggerPrice (limit order regular, no algo order) se ignora", () => {
    const orders = [algoOrder({ side: "sell", reduceOnly: true, triggerPrice: null })];
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
  });

  it("solo hay TP, no hay SL -> hasStopLoss false aunque el TP sí se identifique", () => {
    const orders = [algoOrder({ side: "sell", reduceOnly: true, triggerPrice: 110 })];
    const result = classifyProtectionOrders({ orders, isLong: true, entryPrice: 100 });
    expect(result.hasStopLoss).toBe(false);
    expect(result.takeProfit).toEqual({ price: 110, status: "open" });
  });
});

describe("isValidCcxtSymbol", () => {
  it("acepta símbolos unificados válidos", () => {
    expect(isValidCcxtSymbol("ENA/USDT:USDT")).toBe(true);
    expect(isValidCcxtSymbol("BTC/USDT")).toBe(true);
  });

  it("rechaza formatos inválidos o intentos de inyección", () => {
    expect(isValidCcxtSymbol("")).toBe(false);
    expect(isValidCcxtSymbol("ENAUSDT")).toBe(false);
    expect(isValidCcxtSymbol("ena/usdt")).toBe(false); // ccxt unificado es mayúsculas
    expect(isValidCcxtSymbol("ENA/USDT; DROP TABLE users")).toBe(false);
    expect(isValidCcxtSymbol("../../etc/passwd")).toBe(false);
  });
});

describe("extractTickSize", () => {
  // Binance usa precisionMode TICK_SIZE en ccxt: `precision.price` es el
  // tamaño del paso, no decimales (node_modules/ccxt/js/src/binance.js:1341,
  // 3914-3924 — el valor real viene de PRICE_FILTER.tickSize). 0.1 es el
  // ejemplo real documentado ahí mismo para varios pares USDM futures.
  it("el tick size real de Binance (TICK_SIZE, ej. BTCUSDT futures) es el paso de precio", () => {
    expect(extractTickSize({ precision: { price: 0.1 } })).toBe(0.1);
  });

  it("acepta valores chicos típicos de altcoins", () => {
    expect(extractTickSize({ precision: { price: 0.0001 } })).toBe(0.0001);
  });

  it("sin mercado, sin precision, o tick 0/negativo -> null (nunca inventa una tolerancia)", () => {
    expect(extractTickSize(undefined)).toBeNull();
    expect(extractTickSize(null)).toBeNull();
    expect(extractTickSize({})).toBeNull();
    expect(extractTickSize({ precision: {} })).toBeNull();
    expect(extractTickSize({ precision: { price: 0 } })).toBeNull();
    expect(extractTickSize({ precision: { price: -0.1 } })).toBeNull();
  });
});
