import { describe, it, expect, vi, beforeEach } from "vitest";

// Caracterización de Trader.executeTrade (RULES.md Regla 1 y Regla 2, más A6/A7/A8/M6 del ROADMAP).
// Ninguna llamada de red posible: ccxt, sst y el helper de alerta crítica están mockeados, y fetch
// global lanza si algo se escapa del mock (esto además de lo que ya bloquea tests/setup.ts).
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
    // Configurable por test: symbol -> posición real que devuelve fetchPositions.
    positions: Record<string, { symbol: string; contracts: number }> = {};

    constructor(opts: any) {
      this.apiKey = opts?.apiKey;
    }

    loadMarkets = vi.fn().mockResolvedValue(undefined);
    fetchBalance = vi.fn().mockResolvedValue({ free: { USDT: "100" } });
    setLeverage = vi.fn().mockResolvedValue(undefined);
    setMarginMode = vi.fn().mockResolvedValue(undefined);
    fetchTicker = vi.fn().mockResolvedValue({ last: 100 });
    fetchOpenOrders = vi.fn().mockResolvedValue([]);
    cancelOrder = vi.fn().mockResolvedValue(undefined);
    fetchMyTrades = vi.fn().mockResolvedValue([]);

    fetchPositions = vi.fn(async (symbols?: string[]) => {
      const wanted = symbols?.[0];
      const pos = wanted ? this.positions[wanted] : undefined;
      return pos ? [pos] : Object.values(this.positions);
    });

    cancelAllOrders = vi.fn(async (...args: any[]) => {
      this.calls.push({ method: "cancelAllOrders", args });
      return {};
    });

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

function duplicateClientOrderIdError() {
  return new Error('binance {"code":-20132,"msg":"The client algo id is duplicated."}');
}

function genericExchangeError(msg = "Binance rechazó la orden") {
  return new Error(`binance {"code":-1001,"msg":"${msg}"}`);
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

    expect(result.status).toBe("ejecutado");
    expect(result.mensaje).toContain("TRADE EJECUTADO");
    expect(result.mensaje).toContain("x2");
    expect(exchange.setLeverage).toHaveBeenCalledWith(2, "BTC/USDT");
  });

  it("necesita escalar hasta cumplir minNotional (ejemplo de RULES.md: leverageMin=2, leverageMax=5, margen=3, minNotional=10 → x4)", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["DOGE/USDT"] = makeMarket({ symbol: "DOGE/USDT:USDT", limits: { cost: { min: 10 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 0.1 });

    const result = await trader.executeTrade("DOGE/USDT", "LONG", 0.09, 0.11, 3, 2, 5);

    expect(result.status).toBe("ejecutado");
    expect(result.mensaje).toContain("x4");
    expect(result.mensaje).toContain("Posición Total: $12.00");
    expect(exchange.setLeverage).toHaveBeenCalledWith(4, "DOGE/USDT");
  });

  it("ni con leverageMax alcanza el minNotional: rechaza sin colocar ninguna orden (nunca Math.min como fallback)", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["DOGE/USDT"] = makeMarket({ symbol: "DOGE/USDT:USDT", limits: { cost: { min: 50 } } });

    const result = await trader.executeTrade("DOGE/USDT", "LONG", 0.09, 0.11, 3, 2, 5);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("Capital insuficiente");
    expect(exchange.setLeverage).not.toHaveBeenCalled();
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
    expect(exchange.createOrder).not.toHaveBeenCalled();
  });

  // Hallazgo M6 (ROADMAP.md), ya arreglado: rechaza sin tocar el exchange en vez de
  // ejecutar con leverage = leverageMin por encima de leverageMax.
  it("[M6] leverageMin > leverageMax: rechaza sin tocar el exchange", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket({ limits: { cost: { min: 10 } } });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 10, 2);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("Configuración inválida");
    expect(result.mensaje).toContain("x10");
    expect(result.mensaje).toContain("x2");
    expect(exchange.loadMarkets).not.toHaveBeenCalled();
    expect(exchange.setLeverage).not.toHaveBeenCalled();
  });
});

describe("executeTrade — Regla 2 (validación de balance)", () => {
  it("saldo suficiente: sigue el flujo normal", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockResolvedValue({ free: { USDT: "50" } });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("ejecutado");
  });

  it("saldo insuficiente: rechaza antes de evaluar leverage y sin colocar órdenes", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockResolvedValue({ free: { USDT: "5" } });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("Balance insuficiente");
    expect(exchange.setLeverage).not.toHaveBeenCalled();
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});

describe("executeTrade — mercado no encontrado", () => {
  it("rechaza directo, sin llamar fetchBalance", async () => {
    const { trader, exchange } = makeTrader();
    // No se registra ningún market para este símbolo.

    const result = await trader.executeTrade("XXX/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("no encontrado");
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
  });
});

describe("executeTrade — secuencia y parámetros de las órdenes", () => {
  it("coloca primero la orden de mercado, después el SL y después el TP, con los parámetros esperados", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });

    const result = await trader.executeTrade("BTC/USDT", "SHORT", 51000, 49000, 25, 1, 2);

    expect(result.status).toBe("ejecutado");
    expect(exchange.calls.map((c) => c.method)).toEqual(["createMarketOrder", "createOrder", "createOrder"]);

    const [marketCall, slCall, tpCall] = exchange.calls;
    expect(marketCall.args[0]).toBe("BTC/USDT");
    expect(marketCall.args[1]).toBe("sell"); // SHORT → sell
    const amount = marketCall.args[2];

    expect(slCall.args[0]).toBe("BTC/USDT");
    expect(slCall.args[1]).toBe("STOP_MARKET");
    expect(slCall.args[2]).toBe("buy"); // oppositeSide de sell
    expect(slCall.args[3]).toBe(amount);
    expect(slCall.args[4]).toBeUndefined();
    expect(slCall.args[5]).toMatchObject({ stopPrice: 51000, closePosition: true, timeInForce: "GTC" });
    expect(slCall.args[5].clientOrderId).toMatch(/^sl_/);

    expect(tpCall.args[1]).toBe("TAKE_PROFIT_MARKET");
    expect(tpCall.args[2]).toBe("buy");
    expect(tpCall.args[5]).toMatchObject({ stopPrice: 49000, closePosition: true, timeInForce: "GTC" });
    expect(tpCall.args[5].clientOrderId).toMatch(/^tp_/);
  });

  it("el clientOrderId de SL y TP respeta el charset y largo que exige Binance (<=36, [.A-Za-z0-9-_])", async () => {
    const { trader, exchange } = makeTrader();
    // Símbolo largo, caso realista de un contrato con nombre largo.
    exchange.markets["1000SHIB/USDT"] = makeMarket({ symbol: "1000SHIB/USDT:USDT" });
    exchange.fetchTicker.mockResolvedValue({ last: 0.001 });

    await trader.executeTrade("1000SHIB/USDT", "LONG", 0.0009, 0.0011, 25, 1, 2);

    const ids = exchange.calls.filter((c) => c.method === "createOrder").map((c) => c.args[5].clientOrderId);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(36);
      expect(id).toMatch(/^[.\w-]+$/);
    }
  });

  it("mapea LONG → buy y calcula el amount con decimales realistas según la precisión del market", async () => {
    const { trader, exchange } = makeTrader();
    // Market con 3 decimales de precisión en amount, como un contrato real de BTC/USDT.
    exchange.markets["BTC/USDT"] = makeMarket({ precision: { amount: 3, price: 1 } });
    exchange.fetchTicker.mockResolvedValue({ last: 63000 });

    // margen=25, leverage=2 → notional=$50 → amount = 50/63000 = 0.00079365... → toFixed(3) = "0.001"
    const result = await trader.executeTrade("BTC/USDT", "LONG", 60000, 66000, 25, 2, 2);

    expect(exchange.createMarketOrder).toHaveBeenCalledWith("BTC/USDT", "buy", 0.001);
    expect(result.mensaje).toContain("Cantidad: 0.001 tokens");
  });

  it("amount calculado da 0 tras la precisión del exchange: rechaza sin colocar ninguna orden", async () => {
    const { trader, exchange } = makeTrader();
    // 0 decimales de precisión: el notional mínimo ($10, el piso duro del código)
    // alcanza para pasar la Regla 1, pero a $63000 el precio, 10/63000 redondea a 0 tokens.
    exchange.markets["BTC/USDT"] = makeMarket({ precision: { amount: 0, price: 1 }, limits: { cost: { min: 1 } } });
    exchange.fetchTicker.mockResolvedValue({ last: 63000 });

    const result = await trader.executeTrade("BTC/USDT", "LONG", 60000, 66000, 10, 1, 1);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("Cantidad calculada de tokens es 0");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});

describe("executeTrade — A6: reintentos y protección de SL/TP (ROADMAP A6)", () => {
  it("si el SL falla una vez pero el reintento sale bien, ejecuta normal", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createOrder.mockRejectedValueOnce(genericExchangeError());

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result.status).toBe("ejecutado");
    // exchange.calls (el tracker propio) solo registra los intentos que resuelven: para contar
    // TODOS los intentos (incluido el que rechaza) hace falta mock.calls, que vitest llena siempre.
    const slAttempts = exchange.createOrder.mock.calls.filter((args: any[]) => args[1] === "STOP_MARKET");
    expect(slAttempts).toHaveLength(2);
    // Mismo clientOrderId en el intento y en el reintento: no duplica la orden en Binance.
    expect(slAttempts[0][5].clientOrderId).toBe(slAttempts[1][5].clientOrderId);
  });

  it("si el SL falla y el reintento choca con -20132 (duplicado), lo toma como éxito y no reintenta una tercera vez", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    // El primer intento "se pierde" por timeout (rechazo genérico); Binance ya lo había
    // recibido, así que el reintento con el mismo id choca con -20132.
    exchange.createOrder
      .mockRejectedValueOnce(genericExchangeError("timeout"))
      .mockRejectedValueOnce(duplicateClientOrderIdError());

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result.status).toBe("ejecutado");
    const slAttempts = exchange.createOrder.mock.calls.filter((args: any[]) => args[1] === "STOP_MARKET");
    expect(slAttempts).toHaveLength(2); // no hace un tercer intento tras el -20132
  });

  it(
    "si el SL agota los 3 intentos, cierra la posición a mercado con el tamaño real (fetchPositions) y reporta advertencia",
    async () => {
      const { trader, exchange } = makeTrader();
      exchange.markets["BTC/USDT"] = makeMarket();
      exchange.fetchTicker.mockResolvedValue({ last: 50000 });
      exchange.createOrder.mockImplementation(async (...args: any[]) => {
        if (args[1] === "STOP_MARKET") throw genericExchangeError();
        exchange.calls.push({ method: "createOrder", args });
        return { id: "order-1" };
      });
      // La posición real (0.501) puede diferir levemente del amount calculado por slippage.
      exchange.positions["BTC/USDT"] = { symbol: "BTC/USDT", contracts: 0.501 };

      const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

      expect(result.status).toBe("advertencia");
      expect(result.mensaje).toContain("CERRADA POR FALLA DE PROTECCIÓN");

      const closeCall = exchange.calls.find(
        (c) => c.method === "createMarketOrder" && c.args[1] === "sell" && c.args[2] === 0.501
      );
      expect(closeCall).toBeDefined();
      expect(closeCall!.args[3]).toMatchObject({ reduceOnly: true });

      // Nunca intenta el TP si el SL no se pudo confirmar.
      expect(exchange.calls.some((c) => c.method === "createOrder" && c.args[1] === "TAKE_PROFIT_MARKET")).toBe(false);

      // Barrido de limpieza: regulares Y algo orders.
      expect(exchange.cancelAllOrders).toHaveBeenCalledWith("BTC/USDT");
      expect(exchange.cancelAllOrders).toHaveBeenCalledWith("BTC/USDT", { trigger: true });
    },
    5000
  );

  it(
    "si el SL agota los intentos y el cierre de emergencia también falla, reporta crítico",
    async () => {
      const { trader, exchange } = makeTrader();
      exchange.markets["BTC/USDT"] = makeMarket();
      exchange.fetchTicker.mockResolvedValue({ last: 50000 });
      exchange.createOrder.mockRejectedValue(genericExchangeError());
      exchange.fetchPositions.mockRejectedValue(new Error("timeout de red"));

      const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

      expect(result.status).toBe("critico");
      expect(result.mensaje).toContain("ACCIÓN MANUAL URGENTE");
      // Igual intenta barrer las órdenes que hayan quedado, aunque el cierre haya fallado.
      expect(exchange.cancelAllOrders).toHaveBeenCalledWith("BTC/USDT");
      expect(exchange.cancelAllOrders).toHaveBeenCalledWith("BTC/USDT", { trigger: true });
    },
    5000
  );

  it(
    "si solo el TP agota los intentos (el SL sí se colocó), no cierra la posición y reporta advertencia",
    async () => {
      const { trader, exchange } = makeTrader();
      exchange.markets["BTC/USDT"] = makeMarket();
      exchange.fetchTicker.mockResolvedValue({ last: 50000 });
      exchange.createOrder.mockImplementation(async (...args: any[]) => {
        if (args[1] === "TAKE_PROFIT_MARKET") throw genericExchangeError();
        exchange.calls.push({ method: "createOrder", args });
        return { id: "order-1" };
      });

      const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

      expect(result.status).toBe("advertencia");
      expect(result.mensaje).toContain("SIN TAKE PROFIT");
      expect(exchange.fetchPositions).not.toHaveBeenCalled();
      expect(exchange.cancelAllOrders).not.toHaveBeenCalled();
    },
    5000
  );
});

describe("executeTrade — errores de red/exchange en cada paso", () => {
  it("loadMarkets lanza: cae al catch general", async () => {
    const { trader, exchange } = makeTrader();
    exchange.loadMarkets.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("❌ Error Fatal");
  });

  it("fetchBalance lanza: cae al catch general", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchBalance.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(result.mensaje).toContain("❌ Error Fatal");
  });

  it("fetchTicker lanza: cae al catch general, sin colocar ninguna orden", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 90, 110, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });

  it("createMarketOrder lanza: cae al catch general y no intenta SL/TP", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.createMarketOrder.mockRejectedValue(new Error("timeout de red"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(exchange.createOrder).not.toHaveBeenCalled();
  });

  // Hallazgo A7 (ROADMAP.md), ya arreglado.
  it("[A7] si falla setLeverage, aborta antes de colocar la orden", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.setLeverage.mockRejectedValue(new Error("Binance rechazó el cambio de leverage"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });

  // Hallazgo A8 (ROADMAP.md), ya arreglado.
  it("[A8] si falla setMarginMode, aborta antes de colocar la orden", async () => {
    const { trader, exchange } = makeTrader();
    exchange.markets["BTC/USDT"] = makeMarket();
    exchange.fetchTicker.mockResolvedValue({ last: 50000 });
    exchange.setMarginMode.mockRejectedValue(new Error("Binance rechazó el cambio de margin mode"));

    const result = await trader.executeTrade("BTC/USDT", "LONG", 49000, 51000, 25, 1, 2);

    expect(result.status).toBe("rechazado");
    expect(exchange.createMarketOrder).not.toHaveBeenCalled();
  });
});
