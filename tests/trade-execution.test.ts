import { describe, it, expect, vi, beforeEach } from "vitest";

// recordExecutionResult es el helper compartido por webhook.ts y SignalController.ts (fix del
// bug donde "advertencia" por cierre de emergencia -SL falló, posición ya plana- quedaba
// marcado isActiveTrade=true igual que "advertencia" por TP sin colocar -posición sigue
// abierta-). Ningún test toca la red ni Postgres real: db está mockeado.
const mocks = vi.hoisted(() => ({
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflict: vi.fn(),
}));

vi.mock("../src/db/index.js", () => ({
  db: {
    update: vi.fn(() => ({ set: mocks.updateSet })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}));

const { recordExecutionResult } = await import("../src/cron/tradeExecution.js");

function makeTrader(getClosingFill: any) {
  return { getClosingFill } as any;
}

function lastSetValues(): any {
  return mocks.updateSet.mock.calls.at(-1)![0];
}
function lastInsertValues(): any {
  return mocks.insertValues.mock.calls.at(-1)![0];
}

beforeEach(() => {
  mocks.updateWhere.mockReset().mockResolvedValue(undefined);
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
  it("marca Descartada y NO inserta en trade_executions (sin posición real en Binance)", async () => {
    const trader = makeTrader(vi.fn());
    const result = await recordExecutionResult({
      ...baseInput,
      executionResult: { status: "rechazado", mensaje: "Balance insuficiente" },
      trader,
    });

    expect(result.finalDecision).toBe("Descartada");
    expect(result.isActiveTrade).toBe(false);
    expect(lastSetValues()).toMatchObject({ decision: "Descartada", isActiveTrade: false });
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
