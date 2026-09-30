import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Ningún test toca red, base de datos ni Telegram: sst, telegraf, db, ccxt y Trader están mockeados.
const mocks = vi.hoisted(() => ({
  secret: "secreto-de-prueba",
  handleUpdate: vi.fn(),
  use: vi.fn(),
  action: vi.fn(),
  returning: vi.fn(),
  deleteWhere: vi.fn(),
  resource: { TELEGRAM_TOKEN: { value: "token-falso" }, TELEGRAM_WEBHOOK_SECRET: { value: "secreto-de-prueba" } } as any,
  signalFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  updateWhere: vi.fn(),
  executeTrade: vi.fn(),
  sendCriticalAlert: vi.fn(),
}));

vi.mock("sst", () => ({ Resource: mocks.resource }));
vi.mock("telegraf", () => ({
  Telegraf: class {
    command = vi.fn();
    action = mocks.action;
    on = vi.fn();
    use = mocks.use;
    handleUpdate = mocks.handleUpdate;
  },
}));
vi.mock("telegraf/filters", () => ({ message: vi.fn() }));
vi.mock("ccxt", () => ({ default: {} }));
vi.mock("../src/bot/trader.js", () => ({
  Trader: class {
    executeTrade = mocks.executeTrade;
  },
}));
vi.mock("../src/bot/criticalAlert.js", () => ({ sendCriticalAlert: mocks.sendCriticalAlert }));
vi.mock("../src/api/core/utils/encryption.js", () => ({ decrypt: (v: string) => v }));
vi.mock("../src/db/index.js", () => ({
  db: {
    query: {
      signalHistory: { findFirst: mocks.signalFindFirst },
      userConfig: { findFirst: mocks.userFindFirst },
    },
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: mocks.returning }) }) }),
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));

vi.stubEnv("TELEGRAM_TOKEN", "token-falso");
// webhook.ts importa encryption.ts, que exige ENCRYPTION_KEY al cargarse: llave falsa, solo para el test.
vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
const { handler } = await import("../src/telegram/webhook.js");
const { isValidWebhookSecret, getSecretHeader } = await import("../src/telegram/verifyWebhook.js");
const { isAllowedChat } = await import("../src/telegram/allowlist.js");

// Middleware de lista de permitidos que webhook.ts registra con bot.use() al cargarse.
const chatGuard = mocks.use.mock.calls[0][0] as (ctx: any, next: () => Promise<void>) => Promise<void>;

// Callback "✅ Ejecutar Sniper" que webhook.ts registra con bot.action(/^paper_accept_(\d+)$/, ...).
const acceptHandler = mocks.action.mock.calls.find((call: any[]) =>
  (call[0] as RegExp).source.includes("paper_accept")
)![1] as (ctx: any) => Promise<void>;

const HEADER = "x-telegram-bot-api-secret-token";
const update = { update_id: 1001, message: { text: "/status" } };
const makeEvent = (headers: Record<string, string> | undefined, body: string) => ({ headers, body });

describe("isValidWebhookSecret", () => {
  it("rechaza si no hay header", () => {
    expect(isValidWebhookSecret(undefined, mocks.secret)).toBe(false);
    expect(isValidWebhookSecret("", mocks.secret)).toBe(false);
  });

  it("rechaza un header incorrecto (misma longitud, más corto y más largo)", () => {
    expect(isValidWebhookSecret("secreto-de-pruebX", mocks.secret)).toBe(false);
    expect(isValidWebhookSecret("secreto", mocks.secret)).toBe(false);
    expect(isValidWebhookSecret(mocks.secret + "-extra", mocks.secret)).toBe(false);
  });

  it("acepta el header correcto", () => {
    expect(isValidWebhookSecret(mocks.secret, mocks.secret)).toBe(true);
  });

  it("falla cerrado si el secret esperado no está configurado", () => {
    expect(isValidWebhookSecret(mocks.secret, undefined)).toBe(false);
    expect(isValidWebhookSecret("", "")).toBe(false);
    expect(isValidWebhookSecret(undefined, undefined)).toBe(false);
  });
});

describe("getSecretHeader", () => {
  it("encuentra el header sin distinguir mayúsculas", () => {
    expect(getSecretHeader({ "X-Telegram-Bot-Api-Secret-Token": "abc" })).toBe("abc");
    expect(getSecretHeader({ [HEADER]: "abc" })).toBe("abc");
  });

  it("devuelve undefined si no está o no hay headers", () => {
    expect(getSecretHeader({ "content-type": "application/json" })).toBeUndefined();
    expect(getSecretHeader(undefined)).toBeUndefined();
  });
});

describe("handler del webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", mocks.secret);
    mocks.handleUpdate.mockReset().mockResolvedValue(undefined);
    mocks.returning.mockReset().mockResolvedValue([{ updateId: update.update_id }]);
    mocks.deleteWhere.mockReset().mockResolvedValue(undefined);
    mocks.resource.TELEGRAM_WEBHOOK_SECRET = { value: mocks.secret };
    vi.spyOn(Math, "random").mockReturnValue(0.99); // sin limpieza oportunista
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
  });

  it("sin header: 401 sin detalles y sin procesar", async () => {
    const res = await handler(makeEvent({}, JSON.stringify(update)));
    expect(res).toEqual({ statusCode: 401, body: "" });
    expect(mocks.returning).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("header incorrecto: 401 y sin procesar", async () => {
    const res = await handler(makeEvent({ [HEADER]: "incorrecto" }, JSON.stringify(update)));
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe("");
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("verifica el header antes de parsear el body (header malo + body inválido sigue siendo 401)", async () => {
    const res = await handler(makeEvent({ [HEADER]: "incorrecto" }, "esto no es json {"));
    expect(res.statusCode).toBe(401);
  });

  it("header correcto: 200 y procesa el update una vez", async () => {
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, JSON.stringify(update)));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.handleUpdate).toHaveBeenCalledWith(update);
  });

  it("acepta el header con mayúsculas en el nombre", async () => {
    const res = await handler(makeEvent({ "X-Telegram-Bot-Api-Secret-Token": mocks.secret }, JSON.stringify(update)));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it("falla cerrado si el secret no está configurado: rechaza incluso un header vacío", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    mocks.resource.TELEGRAM_WEBHOOK_SECRET = undefined;
    const casos: Record<string, string>[] = [{}, { [HEADER]: "" }, { [HEADER]: mocks.secret }];
    for (const headers of casos) {
      const res = await handler(makeEvent(headers, JSON.stringify(update)));
      expect(res.statusCode).toBe(401);
    }
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("header correcto y body inválido: 200 sin procesar", async () => {
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, "esto no es json {"));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("update_id repetido (reentrega): 200 sin procesar de nuevo", async () => {
    mocks.returning.mockResolvedValue([]);
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, JSON.stringify(update)));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("update sin update_id: 200 sin procesar", async () => {
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, JSON.stringify({ message: { text: "hola" } })));
    expect(res.statusCode).toBe(200);
    expect(mocks.returning).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("falla cerrado si no se puede reservar el update_id: 200 sin procesar", async () => {
    mocks.returning.mockRejectedValue(new Error("db caída"));
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, JSON.stringify(update)));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("si la lógica del bot falla, igual responde 200", async () => {
    mocks.handleUpdate.mockRejectedValue(new Error("falló el bot"));
    const res = await handler(makeEvent({ [HEADER]: mocks.secret }, JSON.stringify(update)));
    expect(res.statusCode).toBe(200);
    expect(mocks.handleUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("isAllowedChat", () => {
  it("acepta un chat de la lista, sea número o texto, y tolera espacios", () => {
    expect(isAllowedChat(12345, "12345")).toBe(true);
    expect(isAllowedChat("12345", " 999 , 12345 ")).toBe(true);
  });

  it("rechaza un chat que no está en la lista o si no hay chat", () => {
    expect(isAllowedChat(777, "12345,999")).toBe(false);
    expect(isAllowedChat(undefined, "12345")).toBe(false);
  });

  it("falla cerrado si la lista no está configurada o está vacía", () => {
    expect(isAllowedChat(12345, undefined)).toBe(false);
    expect(isAllowedChat(12345, "")).toBe(false);
    expect(isAllowedChat(12345, " , ")).toBe(false);
  });
});

describe("guard de chats permitidos (bot.use)", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_CHAT_IDS", "12345");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("ALLOWED_CHAT_IDS", "");
  });

  it("deja pasar un update de un chat permitido", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    await chatGuard({ chat: { id: 12345 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("ignora un update de un chat no permitido (comando, callback o /start)", async () => {
    const next = vi.fn();
    await chatGuard({ chat: { id: 777 }, message: { text: "/start" } }, next);
    await chatGuard({ chat: { id: 777 }, callbackQuery: { data: "paper_accept_1" } }, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignora un update sin chat", async () => {
    const next = vi.fn();
    await chatGuard({}, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("falla cerrado si ALLOWED_CHAT_IDS no está configurado", async () => {
    vi.stubEnv("ALLOWED_CHAT_IDS", "");
    const next = vi.fn();
    await chatGuard({ chat: { id: 12345 } }, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// Callback "✅ Ejecutar Sniper" — robustez del mensaje de resultado (ver webhook.ts:288 y
// ROADMAP.md A8). El foco de estos tests no es RULES.md ni el escalado de apalancamiento
// (eso ya lo cubre tests/trader.test.ts con Trader real): acá Trader.executeTrade está
// mockeado y lo que se prueba es qué hace webhook.ts con el resultado.
describe("acción paper_accept_ — entrega del resultado en Telegram", () => {
  function makeCtx(overrides: Partial<any> = {}) {
    return {
      match: ["paper_accept_1", "1"],
      chat: { id: 12345 },
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      callbackQuery: { message: { text: "🚨 NUEVA SEÑAL ENCONTRADA (Sniper)" } },
      editMessageText: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    mocks.signalFindFirst.mockResolvedValue({
      id: 1,
      symbol: "BTC/USDT:USDT",
      direction: "LONG",
      gridSL: "49000",
      gridTP: "51000",
      decision: null,
      evaluatedAt: new Date(), // recién evaluada: nunca expira en estos tests
    });
    mocks.userFindFirst.mockResolvedValue({
      chatId: "12345",
      binanceApiKey: "clave-cifrada-falsa",
      binanceApiSecret: "secreto-cifrado-falso",
      montoOperacion: 25,
      leverageMin: 1,
      leverageMax: 2,
      fcmTokens: [],
    });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.executeTrade.mockReset();
    mocks.sendCriticalAlert.mockReset().mockResolvedValue(undefined);
  });

  it("si editMessageText falla, manda el resultado como mensaje nuevo con ctx.reply", async () => {
    mocks.executeTrade.mockResolvedValue({ status: "ejecutado", mensaje: "TRADE EJECUTADO EN BINANCE" });
    const ctx = makeCtx({ editMessageText: vi.fn().mockRejectedValue(new Error("message to edit not found")) });

    await acceptHandler(ctx);

    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0][0]).toContain("TRADE EJECUTADO EN BINANCE");
  });

  it('con status "critico", sendCriticalAlert se llama aunque falle la edición del mensaje', async () => {
    mocks.executeTrade.mockResolvedValue({
      status: "critico",
      mensaje: "POSICIÓN ABIERTA SIN PROTECCIÓN — ACCIÓN MANUAL URGENTE",
    });
    const ctx = makeCtx({ editMessageText: vi.fn().mockRejectedValue(new Error("message to edit not found")) });

    await acceptHandler(ctx);

    expect(mocks.sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(mocks.sendCriticalAlert).toHaveBeenCalledWith(
      "12345",
      [],
      "POSICIÓN ABIERTA SIN PROTECCIÓN — ACCIÓN MANUAL URGENTE"
    );
  });

  it('con status "critico" y la edición OK, sendCriticalAlert igual se llama (no depende de la entrega del mensaje)', async () => {
    mocks.executeTrade.mockResolvedValue({ status: "critico", mensaje: "acción manual urgente" });
    const ctx = makeCtx();

    await acceptHandler(ctx);

    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCriticalAlert).toHaveBeenCalledTimes(1);
  });
});
