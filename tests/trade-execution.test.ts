import { describe, it, expect, vi, beforeEach } from "vitest";

// recordExecutionResult es el helper compartido por webhook.ts y SignalController.ts (fix del
// bug donde "advertencia" por cierre de emergencia -SL falló, posición ya plana- quedaba
// marcado isActiveTrade=true igual que "advertencia" por TP sin colocar -posición sigue
// abierta-). Ningún test toca la red ni Postgres real: db está mockeado.
const mocks = vi.hoisted(() => ({
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflict: vi.fn(),
}));

function makeWhereResult(returningMock: any) {
  const result: any = { returning: returningMock };
  result.then = (resolve: any) => resolve(undefined);
  return result;
}

vi.mock("../src/db/index.js", () => ({
  db: {
    update: vi.fn(() => ({ set: mocks.updateSet })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}));

const { recordExecutionResult, reserveSignalForExecution, markReservationFailed } = await import("../src/cron/tradeExecution.js");

function makeTrader(
  getClosingFill: any,
  getFillsForOrder: any = vi.fn().mockResolvedValue({ quantity: 1, avgPrice: 12345, fee: 0 }) // resuelve en el primer intento: a los tests que no les importa el entry price no les suma reintentos de más.
) {
  return { getClosingFill, getFillsForOrder } as any;
}

function lastSetValues(): any {
  return mocks.updateSet.mock.calls.at(-1)![0];
}
function lastInsertValues(): any {
  return mocks.insertValues.mock.calls.at(-1)![0];
}

beforeEach(() => {
  mocks.updateReturning.mockReset().mockResolvedValue([{ id: 1 }]);
  mocks.updateWhere.mockReset().mockImplementation(() => makeWhereResult(mocks.updateReturning));
  mocks.updateSet.mockReset().mockImplementation(() => ({ where: mocks.updateWhere }));
  mocks.insertOnConflict.mockReset().mockResolvedValue(undefined);
  mocks.insertValues.mockReset().mockImplementation(() => ({ onConflictDoNothing: mocks.insertOnConflict }));
});

const baseInput = {
  signalId: 1,
  userId: 2,
  source: "telegram" as const,
  signal: { symbol: "BTC/USDT:USDT", direction: "LONG" as const },
  configuredMargin: 25,
  openedAt: new Date("2026-10-01T00:00:00.000Z"),
};

describe("recordExecutionResult — ejecutado (sin positionOpen, se asume abierta)", () => {
  it("marca Tomada/isActiveTrade=true y registra trade_executions activo", async () => {
    const trader = makeTrader(vi.fn());
    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO" },
      trader,
    });

    expect(result).toEqual({ finalDecision: "Tomada", isActiveTrade: true, closedImmediately: false, close: undefined });
    expect(lastSetValues()).toMatchObject({ decision: "Tomada", isActiveTrade: true });
    expect(lastInsertValues()).toMatchObject({ signalId: 1, userId: 2, source: "telegram", isActive: true });
    expect(lastInsertValues().closedAt).toBeUndefined();
    expect(trader.getClosingFill).not.toHaveBeenCalled();
  });
});

describe("recordExecutionResult — rechazado", () => {
  it("marca Rechazada (no Descartada: esa es el descarte manual del usuario) y NO inserta en trade_executions (sin posición real en Binance)", async () => {
    const trader = makeTrader(vi.fn());
    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "rechazado", mensaje: "Balance insuficiente" },
      trader,
    });

    expect(result.finalDecision).toBe("Rechazada");
    expect(result.isActiveTrade).toBe(false);
    expect(lastSetValues()).toMatchObject({ decision: "Rechazada", isActiveTrade: false });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});

describe("recordExecutionResult — advertencia con TP sin colocar (posición SIGUE abierta)", () => {
  it("isActiveTrade=true, no busca fill de cierre", async () => {
    const trader = makeTrader(vi.fn());
    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "advertencia", mensaje: "TRADE EJECUTADO SIN TAKE PROFIT" },
      trader,
    });

    expect(result.isActiveTrade).toBe(true);
    expect(result.closedImmediately).toBe(false);
    expect(trader.getClosingFill).not.toHaveBeenCalled();
    expect(lastInsertValues()).toMatchObject({ isActive: true });
    expect(lastInsertValues().closedAt).toBeUndefined();
  });
});

describe("recordExecutionResult — advertencia con cierre de emergencia (posición YA plana)", () => {
  it("positionOpen:false cierra la fila con el resultado real del fill, en ambas tablas", async () => {
    const getClosingFill = vi.fn().mockResolvedValue({ fillsFound: true, orderId: "9", quantity: 1, avgPrice: 49500, pnl: -12.5, fee: 0.5, timestamp: 123 });
    const trader = makeTrader(getClosingFill);

    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "advertencia", mensaje: "POSICIÓN CERRADA POR FALLA DE PROTECCIÓN", positionOpen: false },
      trader,
    });

    expect(getClosingFill).toHaveBeenCalledWith("BTC/USDT:USDT", baseInput.openedAt.getTime(), "sell"); // LONG -> exit side sell
    expect(result.isActiveTrade).toBe(false);
    expect(result.closedImmediately).toBe(true);
    expect(result.close).toEqual({ reason: "emergency", pnl: -13, exitPrice: 49500 }); // pnl - fee = -12.5 - 0.5

    expect(lastSetValues()).toMatchObject({ isActiveTrade: false, realizedPnl: "-13.0000", executedExitPrice: "49500" });
    expect(lastInsertValues()).toMatchObject({
      isActive: false, closeReason: "emergency", realizedPnl: "-13.0000", exitPrice: "49500",
    });
    expect(lastInsertValues().closedAt).toBeInstanceOf(Date);
  });

  it("SHORT: el lado de cierre es 'buy', no 'sell'", async () => {
    const getClosingFill = vi.fn().mockResolvedValue({ fillsFound: false });
    const trader = makeTrader(getClosingFill);

    await recordExecutionResult({
      ...baseInput,
      signal: { symbol: "BTC/USDT:USDT", direction: "SHORT" },
      executionResult: { status: "advertencia", mensaje: "cerrada", positionOpen: false },
      trader,
    });

    expect(getClosingFill).toHaveBeenCalledWith("BTC/USDT:USDT", baseInput.openedAt.getTime(), "buy");
  });

  it("si el fill nunca aparece (ni con reintentos), igual cierra la fila con PnL/exitPrice en null", async () => {
    const getClosingFill = vi.fn().mockResolvedValue({ fillsFound: false });
    const trader = makeTrader(getClosingFill);

    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "advertencia", mensaje: "cerrada", positionOpen: false },
      trader,
    });

    expect(getClosingFill).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos, igual que PNL_FETCH_MAX_ATTEMPTS en analyze.ts
    expect(result.close).toEqual({ reason: "emergency", pnl: null, exitPrice: null });
    expect(result.isActiveTrade).toBe(false);
    expect(lastSetValues()).toMatchObject({ realizedPnl: null, executedExitPrice: null });
    expect(lastInsertValues()).toMatchObject({ closeReason: "emergency", realizedPnl: null, exitPrice: null });
  }, 10000);

  it("si el primer intento no encuentra el fill pero un reintento sí, deja de reintentar", async () => {
    const getClosingFill = vi
      .fn()
      .mockResolvedValueOnce({ fillsFound: false })
      .mockResolvedValueOnce({ fillsFound: true, orderId: "9", quantity: 1, avgPrice: 100, pnl: 0, fee: 0, timestamp: 1 });
    const trader = makeTrader(getClosingFill);

    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "advertencia", mensaje: "cerrada", positionOpen: false },
      trader,
    });

    expect(getClosingFill).toHaveBeenCalledTimes(2);
    expect(result.close).toEqual({ reason: "emergency", pnl: 0, exitPrice: 100 });
  }, 10000);
});

// Incidente QNT (2026-10-02): executeTrade nunca devolvía el fill real de entrada, así que
// executedEntryPrice quedaba NULL en toda operación cerrada por la conciliación — y el historial
// de la app trata un "Cerrada" sin executedEntryPrice como descartada, aunque la posición haya
// sido real.
describe("recordExecutionResult — captura el fill de entrada real", () => {
  it("Tomada: busca los fills por el entryOrderId real (no por ventana de tiempo) y los guarda", async () => {
    const getFillsForOrder = vi.fn().mockResolvedValue({ quantity: 0.5, avgPrice: 49950.5, fee: 0.1 });
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO", entryOrderId: "entry-order-9" },
      trader,
    });

    // Filtra por la orden puntual que devolvió executeTrade, no por lado+tiempo: la ventana es
    // solo para que fetchMyTrades devuelva el fill, la identificación es por entryOrderId.
    expect(getFillsForOrder).toHaveBeenCalledWith("BTC/USDT:USDT", "entry-order-9", baseInput.openedAt.getTime() - 60_000);
    expect(lastSetValues()).toMatchObject({ executedEntryPrice: "49950.5" });
    expect(lastInsertValues()).toMatchObject({ entryPrice: "49950.5", quantity: "0.5" });
  });

  it("entrada repartida en varios fills de la misma orden: guarda la cantidad total y el precio promedio ponderado", async () => {
    // getFillsForOrder ya agrega los fills de la orden (ver tests/trader.test.ts), acá solo se
    // confirma que recordExecutionResult persiste ese agregado tal cual, no el precio de un fill
    // suelto (incidente GTC, 2026-10-02: la entrada quedó repartida en 3 fills a precios distintos).
    const getFillsForOrder = vi.fn().mockResolvedValue({ quantity: 197.9, avgPrice: 0.177103148054573, fee: 0.0175 });
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    await recordExecutionResult({
      ...baseInput,
      signal: { symbol: "GTC/USDT:USDT", direction: "LONG" },
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO", entryOrderId: "entry-order-gtc" },
      trader,
    });

    expect(lastSetValues()).toMatchObject({ executedEntryPrice: "0.177103148054573" });
    expect(lastInsertValues()).toMatchObject({ entryPrice: "0.177103148054573", quantity: "197.9" });
  });

  it("si el fill nunca aparece (ni con reintentos), sigue sin él en vez de bloquear la respuesta", async () => {
    const getFillsForOrder = vi.fn().mockResolvedValue(null);
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO", entryOrderId: "entry-order-9" },
      trader,
    });

    expect(getFillsForOrder).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
    expect(result.finalDecision).toBe("Tomada"); // no se bloquea por esto
    expect(lastSetValues().executedEntryPrice).toBeUndefined();
    expect(lastInsertValues()).toMatchObject({ entryPrice: null, quantity: null });
  }, 10000);

  it("si el primer intento no encuentra el fill pero un reintento sí, deja de reintentar", async () => {
    const getFillsForOrder = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: 1, avgPrice: 100, fee: 0 });
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO", entryOrderId: "entry-order-9" },
      trader,
    });

    expect(getFillsForOrder).toHaveBeenCalledTimes(2);
  }, 10000);

  it("sin entryOrderId (no debería pasar salvo en datos viejos): no busca nada, sigue sin entry price", async () => {
    const getFillsForOrder = vi.fn();
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "ejecutado", mensaje: "TRADE EJECUTADO" }, // sin entryOrderId
      trader,
    });

    expect(getFillsForOrder).not.toHaveBeenCalled();
    expect(lastInsertValues()).toMatchObject({ entryPrice: null, quantity: null });
  });

  it("Rechazada: no busca el fill de entrada (nunca hubo posición real)", async () => {
    const getFillsForOrder = vi.fn();
    const trader = makeTrader(vi.fn(), getFillsForOrder);

    await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "rechazado", mensaje: "Balance insuficiente" },
      trader,
    });

    expect(getFillsForOrder).not.toHaveBeenCalled();
  });
});

describe("reserveSignalForExecution", () => {
  it("devuelve true cuando el UPDATE condicional afecta una fila (decision estaba en null)", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: 1 }]);
    const result = await reserveSignalForExecution(1, 2);
    expect(result).toBe(true);
    expect(mocks.updateSet).toHaveBeenCalledWith({ decision: "Ejecutando", reservedByUserId: 2, reservedAt: expect.any(Date) });
  });

  it("devuelve false cuando el UPDATE no afecta ninguna fila (otro pedido ya la reservó)", async () => {
    mocks.updateReturning.mockResolvedValue([]);
    const result = await reserveSignalForExecution(1, 2);
    expect(result).toBe(false);
  });
});

describe("markReservationFailed", () => {
  it("deja la fila en un estado de error explícito, sin liberar la reserva", async () => {
    await markReservationFailed(1, "timeout de red con Binance");
    expect(lastSetValues()).toMatchObject({ decision: "Ejecutando -> Error" });
    expect(lastSetValues().reason).toContain("timeout de red con Binance");
  });
});
