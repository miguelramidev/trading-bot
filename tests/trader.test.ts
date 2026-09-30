import { describe, it, expect, vi, beforeEach } from "vitest";

// Caracterización de Trader.executeTrade (RULES.md Regla 1 y Regla 2).
// Ninguna llamada de red posible: ccxt y sst están mockeados, y fetch global
// lanza si algo se escapa del mock.
vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    throw new Error("Llamada de red real bloqueada en tests: falta mockear algo de ccxt.");
  })
);

const mocks = vi.hoisted(() => {
  class MockExchange {
    markets: Record<string, any> = {};
    calls: { method: string; args: any[] }[] = [];
    apiKey?: string;

    constructor(opts: any) {
      this.apiKey = opts?.apiKey;
    }

    loadMarkets = vi.fn().mockResolvedValue(undefined);
    fetchBalance = vi.fn().mockResolvedValue({ free: { USDT: "100" } });
    setLeverage = vi.fn().mockResolvedValue(undefined);
    setMarginMode = vi.fn().mockResolvedValue(undefined);
    fetchTicker = vi.fn().mockResolvedValue({ last: 100 });
    fetchPositions = vi.fn().mockResolvedValue([]);
    fetchOpenOrders = vi.fn().mockResolvedValue([]);
    cancelOrder = vi.fn().mockResolvedValue(undefined);
    fetchMyTrades = vi.fn().mockResolvedValue([]);

    // Redondeo real por precisión del mercado, no un mock ciego: así los tests
    // que quieren decimales realistas no tienen que reimplementar amountToPrecision.
    amountToPrecision = vi.fn((symbol: string, amount: number) => {
      const decimals = this.markets[symbol]?.precision?.amount ?? 8;
      return amount.toFixed(decimals);
    });

    createMarketOrder = vi.fn(async (...args: any[]) => {
      this.calls.push({ method: "createMarketOrder", args });
      return { id: "market-1" };
    });

    createOrder = vi.fn(async (...args: any[]) => {
      this.calls.push({ method: "createOrder", args });
      return { id: "order-1" };
    });
  }

  const instances: InstanceType<typeof MockExchange>[] = [];
  return { MockExchange, instances };
});

vi.mock("ccxt", () => ({
  default: {
    binance: class extends mocks.MockExchange {
      constructor(opts: any) {
        super(opts);
        mocks.instances.push(this as any);
      }
    },
  },
}));
vi.mock("sst", () => ({ Resource: {} }));

const { Trader } = await import("../src/bot/trader.js");

// Fixture con la forma real de un market de ccxt/Binance Futures (limits, precision).
function makeMarket(overrides: Partial<any> = {}) {
  return {
    id: "BTCUSDT",
    symbol: "BTC/USDT:USDT",
    base: "BTC",
    quote: "USDT",
    settle: "USDT",
    type: "swap",
    linear: true,
    contract: true,
    precision: { amount: 3, price: 1 },
    limits: {
      amount: { min: 0.001, max: 1000 },
      price: { min: undefined, max: undefined },
      cost: { min: 5, max: undefined },
      leverage: { min: 1, max: 125 },
    },
    ...overrides,
  };
}

function makeTrader() {
  const trader = new Trader("api-key-falsa", "api-secret-falsa");
  const exchange = mocks.instances.at(-1)!;
  return { trader, exchange };
}

beforeEach(() => {
  mocks.instances.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("executeTrade — Regla 1 (escalado de apalancamiento)", () => {
  it("leverageMin ya alcanza el minNotional: no escala", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket({ limits: { cost: { min: 10 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 100 });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 2, 5);

    expect(result).toContain("TRADE EJECUTADO");
    expect(result).toContain("x2");
    expect(exchange.setLeverage).toHaveBeenCalledWith(2, "BTC/USDT");
  });

  it("necesita escalar hasta cumplir minNotional (ejemplo de RULES.md: leverageMin=2, leverageMax=5, margen=3, minNotional=10 → x4)", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["DOGE/USDT"] = makeMarket({ symbol: "DOGE/USDT:USDT", limits: { cost: { min: 10 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 0.1 });

    const result = await trader.executeTrade("DOGE/USDT", "LONG", 0.09, 0.11, 3, 2, 5);

    expect(result).toContain("x4");
    expect(result).toContain("Posición Total: $12.00");
    expect(exchange.setLeverage).toHaveBeenCalledWith(4, "DOGE/USDT");
  });

  it("ni con leverageMax alcanza el minNotional: rechaza sin colocar ninguna orden (nunca Math.min como fallback)", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["DOGE/USDT"] = makeMarket({ symbol: "DOGE/USDT:USDT", limits: { cost: { min: 50 } } });

    const result = await trader.executeTrade("DOGE/USDT", "LONG", 0.09, 0.11, 3, 2, 5);

    expect(result).toContain("❌");
    expect(result).toContain("Capital insuficiente");
    expect(exchange.setLeverage).not.toHaveBeenCalled();
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
    expect(exchange.createOrder).not.toHaveBeenCalled();
  });

  // Hallazgo M6 (ROADMAP.md): comportamiento CORRECTO esperado (rechazar), documentado
  // con it.fails porque hoy el bot hace lo contrario: ejecuta con leverage = leverageMin
  // aunque esté por encima de leverageMax, violando la invariante de RULES.md. Cuando
  // se arregle M6, este test va a empezar a pasar y Vitest exige sacarle el .fails.
  it.fails("[M6] leverageMin > leverageMax: debe rechazar, nunca ejecutar por encima de leverageMax", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket({ limits: { cost: { min: 10 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 100 });

    // leverageMin=10 > leverageMax=2, y el notional con leverageMin ya alcanza el mínimo.
    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 10, 2);

    expect(result).toContain("❌");
    expect(exchange.setLeverage).not.toHaveBeenCalledWith(10, "BTC/USDT");
  });
});

describe("executeTrade — Regla 2 (validación de balance)", () => {
  it("saldo suficiente: sigue el flujo normal", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockResolvedValue({ free: { USDT: "50" } });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("TRADE EJECUTADO");
  });

  it("saldo insuficiente: rechaza antes de evaluar leverage y sin colocar órdenes", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockResolvedValue({ free: { USDT: "5" } });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("❌ Balance insuficiente");
    expect(exchange.setLeverage).not.toHaveBeenCalled();
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});

describe("executeTrade — mercado no encontrado", () => {
  it("rechaza directo, sin llamar fetchBalance", async () => {
    const { trader, exchange } = makeTrader();
    // No se registra ningún market para este símbolo.

    const result = await trader.executeTrade("XXX/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("no encontrado");
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
  });
});

describe("executeTrade — secuencia y parámetros de las órdenes", () => {
  it("coloca primero la orden de mercado, después el SL y después el TP, con los parámetros esperados", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });

    await trader.executeTrade("BTC/USDT", "SHORT", 51000, 49000, 25, 1, 2);

    expect(exchange.calls.map((c) => c.method)).toEqual(["createMarketOrder", "createOrder", "createOrder"]);

    const [marketCall, slCall, tpCall] = exchange.calls;
    expect(marketCall.args[0]).toBe("BTC/USDT");
    expect(marketCall.args[1]).toBe("sell"); // SHORT → sell
    const amount = marketCall.args[2];

    expect(slCall.args).toEqual([
      "BTC/USDT",
      "STOP_MARKET",
      "buy", // oppositeSide de sell
      amount,
      undefined,
      { stopPrice: 51000, closePosition: true, timeInForce: "GTC" },
    ]);
    expect(tpCall.args).toEqual([
      "BTC/USDT",
      "TAKE_PROFIT_MARKET",
      "buy",
      amount,
      undefined,
      { stopPrice: 49000, closePosition: true, timeInForce: "GTC" },
    ]);
  });

  it("mapea LONG → buy y calcula el amount con decimales realistas según la precisión del market", async () => {
    const { trader, exchange } = makeTrader();
    // Market con 3 decimales de precisión en amount, como un contrato real de BTC/USDT.
    exchange.markets["BTC/USDT"] = makeMarket({ precision: { amount: 3, price: 1 } });
    exchange.fetchTicker.mockResolvedValue({ last: 63000 });

    // margen=25, leverage=2 → notional=$50 → amount = 50/63000 = 0.00079365... → toFixed(3) = "0.001"
    const result = await trader.executeTrade("BTC/USDT", "LONG", 60000, 66000, 25, 2, 2);

    expect(exchange.createMarketOrder).toHaveBeenCalledWith("BTC/USDT", "buy", 0.001);
    expect(result).toContain("Cantidad: 0.001 tokens");
  });

  it("amount calculado da 0 tras la precisión del exchange: rechaza sin colocar ninguna orden", async () => {
    const { trader, exchange } = makeTrader();
    // 0 decimales de precisión: el notional mínimo ($10, el piso duro del código)
    // alcanza para pasar la Regla 1, pero a $63000 el precio, 10/63000 redondea a 0 tokens.
    exchange.markets["BTC/USDT"] = makeMarket({ precision: { amount: 0, price: 1 }, limits: { cost: { min: 1 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 63000 });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 60000, 66000, 10, 1, 1);

    expect(result).toContain("Cantidad calculada de tokens es 0");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});

describe("executeTrade — A6: fallas al colocar SL/TP (ROADMAP A6)", () => {
  // Documentan el comportamiento CORRECTO esperado (no reportar éxito sin protección).
  // Hoy el código informa "✅ TRADE EJECUTADO" igual, así que fallan a propósito.
  // Cuando se arregle A6 van a empezar a pasar y hay que sacarles el .fails.
  it.fails("[A6] si falla el SL, no debe reportar éxito llano", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createOrder.mockImplementationOnce(async () => {
      throw new Error("Binance rechazó el SL");
    });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result).not.toContain("TRADE EJECUTADO");
  });

  it.fails("[A6] si falla el TP, no debe reportar éxito llano", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createOrder
      .mockImplementationOnce(async (...args: any[]) => {
        exchange.calls.push({ method: "createOrder", args });
        return { id: "sl-1" };
      })
      .mockImplementationOnce(async () => {
        throw new Error("Binance rechazó el TP");
      });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result).not.toContain("TRADE EJECUTADO");
  });

  it.fails("[A6] si fallan SL y TP, no debe reportar éxito llano (posición totalmente desprotegida)", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createOrder.mockImplementation(async () => {
      throw new Error("Binance rechazó la orden de salida");
    });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result).not.toContain("TRADE EJECUTADO");
  });
});

describe("executeTrade — errores de red/exchange en cada paso", () => {
  it("loadMarkets lanza: cae al catch general", async () => {
    const { trader, exchange } = makeTrader();
    exchange.loadMarkets.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("❌ Error Fatal");
  });

  it("fetchBalance lanza: cae al catch general", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("❌ Error Fatal");
  });

  it("fetchTicker lanza: cae al catch general, sin colocar ninguna orden", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result).toContain("❌ Error Fatal");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });

  it("createMarketOrder lanza: cae al catch general y no intenta SL/TP", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createMarketOrder.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result).toContain("❌ Error Fatal");
    expect(exchange.createOrder).not.toHaveBeenCalled();
  });

  // Hallazgo A7 (ROADMAP.md): comportamiento CORRECTO esperado. Hoy setLeverage
  // que falla solo genera un console.warn y la orden sale igual con el
  // apalancamiento que ya tuviera la cuenta en Binance, no el de la Regla 1.
  it.fails("[A7] si falla setLeverage, no debe colocar la orden con un apalancamiento sin confirmar", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.setLeverage.mockRejectedValue(new Error("Binance rechazó el cambio de leverage"));

    await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });

  // Hallazgo A8 (ROADMAP.md): comportamiento CORRECTO esperado. Hoy setMarginMode
  // que falla se ignora en silencio y la orden sale igual, pudiendo quedar en
  // margen cruzado en vez de aislado.
  it.fails("[A8] si falla setMarginMode, no debe colocar la orden sin confirmar modo aislado", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.setMarginMode.mockRejectedValue(new Error("Binance rechazó el cambio de margin mode"));

    await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});
