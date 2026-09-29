import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Ningún test toca red, base de datos ni Telegram: sst, telegraf, db, ccxt y Trader están mockeados.
const mocks = vi.hoisted(() => ({
  secret: "secreto-de-prueba",
  handleUpdate: vi.fn(),
  returning: vi.fn(),
  deleteWhere: vi.fn(),
  resource: { TELEGRAM_TOKEN: { value: "token-falso" }, TELEGRAM_WEBHOOK_SECRET: { value: "secreto-de-prueba" } } as any,
}));

vi.mock("sst", () => ({ Resource: mocks.resource }));
vi.mock("telegraf", () => ({
  Telegraf: class {
    command = vi.fn();
    action = vi.fn();
    on = vi.fn();
    handleUpdate = mocks.handleUpdate;
  },
}));
vi.mock("telegraf/filters", () => ({ message: vi.fn() }));
vi.mock("ccxt", () => ({ default: {} }));
vi.mock("../src/bot/trader.js", () => ({ Trader: class {} }));
vi.mock("../src/db/index.js", () => ({
  db: {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: mocks.returning }) }) }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));

vi.stubEnv("TELEGRAM_TOKEN", "token-falso");
const { handler } = await import("../src/telegram/webhook.js");
const { isValidWebhookSecret, getSecretHeader } = await import("../src/telegram/verifyWebhook.js");

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
