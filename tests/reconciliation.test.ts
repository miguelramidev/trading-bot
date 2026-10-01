import { describe, it, expect, vi, beforeEach } from "vitest";

// Orquestación de la conciliación (src/cron/reconciliation.ts): una sola llamada a
// fetchAllPositions/fetchAllOpenOrders por usuario y por ciclo, aplica la decisión pura de
// reconciliationDecision.ts (ya testeada en tests/reconciliation-decision.test.ts) o solo la
// loguea en modo de solo registro, e idempotencia en el cierre (update condicional con
// isActive=true en el WHERE). Nada toca red/DB real: db, Trader, Telegram y los envíos de
// notificación están mockeados.
const mocks = vi.hoisted(() => ({
  tradeExecFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  signalFindFirst: vi.fn(),
  tradeExecSet: vi.fn(),
  tradeExecReturning: vi.fn(),
  signalHistorySet: vi.fn(),
  fetchAllPositions: vi.fn(),
  fetchAllOpenOrders: vi.fn(),
  getClosingFill: vi.fn(),
  getOrderClientId: vi.fn(),
  getTickSize: vi.fn(),
  cancelLeftoverOrders: vi.fn(),
  sendCriticalAlert: vi.fn(),
  sendPushNotification: vi.fn(),
  telegramSendMessage: vi.fn(),
  traderConstructions: [] as { apiKey: string; apiSecret: string }[],
}));

vi.mock("sst", () => ({ Resource: {} }));
vi.mock("telegraf", () => ({
  Telegram: class {
    constructor(public token: string) {}
    sendMessage = mocks.telegramSendMessage;
  },
}));
vi.mock("../src/firebase.js", () => ({ sendPushNotification: mocks.sendPushNotification }));
vi.mock("../src/bot/criticalAlert.js", () => ({ sendCriticalAlert: mocks.sendCriticalAlert }));
vi.mock("../src/api/core/utils/encryption.js", () => ({ decrypt: (v: string) => `decrypted(${v})` }));
vi.mock("../src/bot/trader.js", () => ({
  Trader: class {
    constructor(apiKey: string, apiSecret: string) {
      mocks.traderConstructions.push({ apiKey, apiSecret });
    }
    fetchAllPositions = mocks.fetchAllPositions;
    fetchAllOpenOrders = mocks.fetchAllOpenOrders;
    getClosingFill = mocks.getClosingFill;
    getOrderClientId = mocks.getOrderClientId;
    getTickSize = mocks.getTickSize;
    cancelLeftoverOrders = mocks.cancelLeftoverOrders;
  },
}));

function makeWhereResult(returningMock?: any) {
  const result: any = { returning: returningMock ?? vi.fn().mockResolvedValue([{ id: 1 }]) };
  result.then = (resolve: any) => resolve(undefined);
  return result;
}

vi.mock("../src/db/index.js", async () => {
  const schema = await import("../src/db/schema.js");
  return {
    db: {
      query: {
        tradeExecutions: { findMany: mocks.tradeExecFindMany },
        userConfig: { findFirst: mocks.userFindFirst },
        signalHistory: { findFirst: mocks.signalFindFirst },
      },
      update: vi.fn((table: any) => {
        if (table === schema.tradeExecutions) {
          return { set: vi.fn((vals: any) => { mocks.tradeExecSet(vals); return { where: vi.fn(() => makeWhereResult(mocks.tradeExecReturning)) }; }) };
        }
        return { set: vi.fn((vals: any) => { mocks.signalHistorySet(vals); return { where: vi.fn(() => makeWhereResult()) }; }) };
      }),
    },
  };
});

const { reconcileActiveTrades, isReconciliationDryRun } = await import("../src/cron/reconciliation.js");

const baseUser = {
  id: 2,
  chatId: "12345",
  binanceApiKey: "clave-cifrada",
  binanceApiSecret: "secreto-cifrado",
  rsaPrivateKey: null,
  fcmTokens: ["token-fcm"],
  notificationsTelegram: true,
  notificationsMobile: true,
  notificationsWeb: true,
};

const baseSignal = {
  id: 100,
  symbol: "BTC/USDT:USDT",
  direction: "LONG",
  entry: "50000",
  gridSL: "49000",
  gridTP: "51000",
  stopLoss: "49000",
  takeProfit: "51000",
};

function makeTradeExecution(overrides: Partial<any> = {}) {
  return {
    id: 1,
    signalId: 100,
    userId: 2,
    quantity: "0.01",
    entryPrice: "50000",
    openedAt: new Date("2026-10-01T00:00:00.000Z"),
    isActive: true,
    lastMissingSlAlertAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.traderConstructions.length = 0;
  mocks.tradeExecFindMany.mockReset();
  mocks.userFindFirst.mockReset().mockResolvedValue(baseUser);
  mocks.signalFindFirst.mockReset().mockResolvedValue(baseSignal);
  mocks.tradeExecSet.mockReset();
  mocks.tradeExecReturning.mockReset().mockResolvedValue([{ id: 1 }]);
  mocks.signalHistorySet.mockReset();
  mocks.fetchAllPositions.mockReset().mockResolvedValue([]);
  mocks.fetchAllOpenOrders.mockReset().mockResolvedValue([]);
  mocks.getClosingFill.mockReset().mockResolvedValue({ fillsFound: false });
  mocks.getOrderClientId.mockReset().mockResolvedValue(undefined);
  mocks.getTickSize.mockReset().mockResolvedValue(1);
  mocks.cancelLeftoverOrders.mockReset().mockResolvedValue(undefined);
  mocks.sendCriticalAlert.mockReset().mockResolvedValue(undefined);
  mocks.sendPushNotification.mockReset().mockResolvedValue(undefined);
  mocks.telegramSendMessage.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("RECONCILIATION_DRY_RUN", "");
  vi.stubEnv("TELEGRAM_TOKEN", "token-falso");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("isReconciliationDryRun", () => {
  it("arranca activado por defecto (sin la variable seteada)", () => {
    vi.stubEnv("RECONCILIATION_DRY_RUN", "");
    expect(isReconciliationDryRun()).toBe(true);
  });

  it("solo se desactiva con el valor exacto 'false'", () => {
    vi.stubEnv("RECONCILIATION_DRY_RUN", "false");
    expect(isReconciliationDryRun()).toBe(false);
    vi.stubEnv("RECONCILIATION_DRY_RUN", "no"); // cualquier otro valor sigue en modo solo registro
    expect(isReconciliationDryRun()).toBe(true);
  });
});

describe("reconcileActiveTrades — sin filas activas", () => {
  it("no instancia ningún Trader ni toca la base", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([]);
    await reconcileActiveTrades();
    expect(mocks.traderConstructions).toHaveLength(0);
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });
});

describe("reconcileActiveTrades — una sola llamada por usuario y por ciclo", () => {
  it("con 2 operaciones activas del mismo usuario, fetchAllPositions/fetchAllOpenOrders se llaman una sola vez", async () => {
    vi.stubEnv("RECONCILIATION_DRY_RUN", "false");
    mocks.tradeExecFindMany.mockResolvedValue([
      makeTradeExecution({ id: 1, signalId: 100 }),
      makeTradeExecution({ id: 2, signalId: 101 }),
    ]);
    mocks.signalFindFirst.mockImplementation(async () => baseSignal); // misma señal simplificada para ambas
    // Ambas "cerradas" (sin posición): evita 3 reintentos reales de 1.5s cada uno por operación.
    mocks.getClosingFill.mockResolvedValue({ fillsFound: true, orderId: "9", quantity: 0.01, avgPrice: 51000, pnl: 10, fee: 0.5 });

    await reconcileActiveTrades();

    expect(mocks.traderConstructions).toHaveLength(1); // un solo Trader para el usuario, no uno por operación
    expect(mocks.fetchAllPositions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllOpenOrders).toHaveBeenCalledTimes(1);
  });

  it("usa las llaves descifradas del usuario para instanciar el Trader", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution()]);
    await reconcileActiveTrades();
    expect(mocks.traderConstructions[0]).toEqual({ apiKey: "decrypted(clave-cifrada)", apiSecret: "decrypted(secreto-cifrado)" });
  });
});

describe("reconcileActiveTrades — modo de solo registro (default)", () => {
  it("no escribe en la base ni notifica, aunque la decisión sea un cierre", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution()]);
    mocks.getClosingFill.mockResolvedValue({ fillsFound: true, orderId: "9", quantity: 0.01, avgPrice: 51000, pnl: 10, fee: 0.5 });
    mocks.getOrderClientId.mockResolvedValue("tp_BTCUSDTUSDT_abc");
    mocks.fetchAllPositions.mockResolvedValue([]); // sin posición -> cerrada

    await reconcileActiveTrades();

    expect(mocks.tradeExecSet).not.toHaveBeenCalled();
    expect(mocks.signalHistorySet).not.toHaveBeenCalled();
    expect(mocks.cancelLeftoverOrders).not.toHaveBeenCalled();
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.telegramSendMessage).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled(); // igual loguea qué habría hecho
  });
});

describe("reconcileActiveTrades — cierre real (modo activo)", () => {
  beforeEach(() => vi.stubEnv("RECONCILIATION_DRY_RUN", "false"));

  it("cerró en TP: actualiza trade_executions y signal_history, cancela huérfanas y notifica", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution()]);
    mocks.fetchAllPositions.mockResolvedValue([]); // ya no hay posición
    mocks.getClosingFill.mockResolvedValue({ fillsFound: true, orderId: "9", quantity: 0.01, avgPrice: 51000, pnl: 10, fee: 0.5 });
    mocks.getOrderClientId.mockResolvedValue("tp_BTCUSDTUSDT_abc");

    await reconcileActiveTrades();

    expect(mocks.tradeExecSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, closeReason: "tp", realizedPnl: "9.5000" }));
    expect(mocks.signalHistorySet).toHaveBeenCalledWith(expect.objectContaining({ isActiveTrade: false, decision: "Tomada -> Cerrada (Objetivo tocado)" }));
    expect(mocks.cancelLeftoverOrders).toHaveBeenCalledWith("BTC/USDT:USDT");
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
    expect(mocks.telegramSendMessage).toHaveBeenCalledTimes(1);
  });

  it("idempotencia: si el update de trade_executions no afecta ninguna fila (ya cerrada por otro ciclo), no actualiza signal_history ni notifica", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution()]);
    mocks.fetchAllPositions.mockResolvedValue([]);
    mocks.getClosingFill.mockResolvedValue({ fillsFound: true, orderId: "9", quantity: 0.01, avgPrice: 51000, pnl: 10, fee: 0.5 });
    mocks.getOrderClientId.mockResolvedValue("tp_BTCUSDTUSDT_abc");
    mocks.tradeExecReturning.mockResolvedValue([]); // el WHERE isActive=true ya no matcheó nada

    await reconcileActiveTrades();

    expect(mocks.signalHistorySet).not.toHaveBeenCalled();
    expect(mocks.cancelLeftoverOrders).not.toHaveBeenCalled();
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.telegramSendMessage).not.toHaveBeenCalled();
  });
});

describe("reconcileActiveTrades — sin Stop Loss (modo activo)", () => {
  beforeEach(() => vi.stubEnv("RECONCILIATION_DRY_RUN", "false"));

  it("primera vez (sin alerta previa): alerta crítica y guarda lastMissingSlAlertAt", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution({ lastMissingSlAlertAt: null })]);
    mocks.fetchAllPositions.mockResolvedValue([{ symbol: "BTC/USDT:USDT", contracts: 0.01, entryPrice: 50000 }]);
    mocks.fetchAllOpenOrders.mockResolvedValue([]); // sin ninguna orden de protección

    await reconcileActiveTrades();

    expect(mocks.sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(mocks.tradeExecSet).toHaveBeenCalledWith(expect.objectContaining({ lastMissingSlAlertAt: expect.any(Date) }));
  });

  it("ya se alertó hace poco: no repite la alerta (throttle)", async () => {
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution({ lastMissingSlAlertAt: new Date() })]);
    mocks.fetchAllPositions.mockResolvedValue([{ symbol: "BTC/USDT:USDT", contracts: 0.01, entryPrice: 50000 }]);
    mocks.fetchAllOpenOrders.mockResolvedValue([]);

    await reconcileActiveTrades();

    expect(mocks.sendCriticalAlert).not.toHaveBeenCalled();
    expect(mocks.tradeExecSet).not.toHaveBeenCalled();
  });
});

describe("reconcileActiveTrades — SL que no coincide (modo activo)", () => {
  it("avisa por Telegram sin cerrar la fila", async () => {
    vi.stubEnv("RECONCILIATION_DRY_RUN", "false");
    mocks.tradeExecFindMany.mockResolvedValue([makeTradeExecution()]);
    mocks.fetchAllPositions.mockResolvedValue([{ symbol: "BTC/USDT:USDT", contracts: 0.01, entryPrice: 50000 }]);
    mocks.fetchAllOpenOrders.mockResolvedValue([
      { symbol: "BTC/USDT:USDT", side: "sell", reduceOnly: true, triggerPrice: 48000, status: "open" }, // señal pedía 49000
      { symbol: "BTC/USDT:USDT", side: "sell", reduceOnly: true, triggerPrice: 51000, status: "open" },
    ]);

    await reconcileActiveTrades();

    expect(mocks.telegramSendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.telegramSendMessage.mock.calls[0][1]).toContain("48000");
    expect(mocks.tradeExecSet).not.toHaveBeenCalled();
  });
});
