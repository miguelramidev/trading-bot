import { describe, it, expect, vi, beforeEach } from "vitest";

// Incidente QNT (2026-10-02): nunca se podaban los tokens FCM inválidos (de reinstalaciones o
// dispositivos viejos) — un usuario llegó a acumular 6, y una sola alerta terminaba mandando
// hasta 6 pushes. Nada toca Firebase ni Postgres real: messaging y db están mockeados.
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  userFindFirst: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("sst", () => ({ Resource: {} }));
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  cert: vi.fn(),
  getApps: () => [{}], // simula que ya hay una app inicializada
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({ send: mocks.send }),
}));
vi.mock("../src/db/index.js", () => ({
  db: {
    query: { userConfig: { findFirst: mocks.userFindFirst } },
    update: vi.fn(() => ({ set: mocks.updateSet })),
  },
}));

const { sendPushNotification, removeFcmToken, sendPushNotificationAndPrune } = await import("../src/firebase.js");

function firebaseError(code: string): any {
  const e: any = new Error(`Firebase error: ${code}`);
  e.code = code;
  return e;
}

beforeEach(() => {
  mocks.send.mockReset();
  mocks.userFindFirst.mockReset();
  mocks.updateWhere.mockReset().mockResolvedValue(undefined);
  mocks.updateSet.mockReset().mockImplementation(() => ({ where: mocks.updateWhere }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sendPushNotification — detección de token inválido", () => {
  it("envío exitoso: sent=true, invalidToken=false", async () => {
    mocks.send.mockResolvedValue(undefined);
    const result = await sendPushNotification("token-1", "Título", "Cuerpo");
    expect(result).toEqual({ sent: true, invalidToken: false });
  });

  it.each([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
  ])("código %s: invalidToken=true", async (code) => {
    mocks.send.mockRejectedValue(firebaseError(code));
    const result = await sendPushNotification("token-1", "Título", "Cuerpo");
    expect(result).toEqual({ sent: false, invalidToken: true });
  });

  it("un error transitorio (ej. cuota, red) NO se trata como token inválido", async () => {
    mocks.send.mockRejectedValue(firebaseError("messaging/internal-error"));
    const result = await sendPushNotification("token-1", "Título", "Cuerpo");
    expect(result).toEqual({ sent: false, invalidToken: false });
  });
});

describe("removeFcmToken", () => {
  it("saca el token de la lista del usuario", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 2, fcmTokens: ["token-1", "token-2", "token-3"] });
    await removeFcmToken(2, "token-2");
    expect(mocks.updateSet).toHaveBeenCalledWith({ fcmTokens: ["token-1", "token-3"] });
  });

  it("idempotente: si el token ya no está, no hace ningún UPDATE", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 2, fcmTokens: ["token-1"] });
    await removeFcmToken(2, "token-2");
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it("usuario sin fcmTokens: no lanza, no actualiza", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 2, fcmTokens: null });
    await expect(removeFcmToken(2, "token-1")).resolves.toBeUndefined();
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
});

describe("sendPushNotificationAndPrune", () => {
  it("token inválido: envía (falla) y lo poda de la lista del usuario", async () => {
    mocks.send.mockRejectedValue(firebaseError("messaging/registration-token-not-registered"));
    mocks.userFindFirst.mockResolvedValue({ id: 2, fcmTokens: ["token-muerto", "token-vivo"] });

    await sendPushNotificationAndPrune(2, "token-muerto", "Título", "Cuerpo");

    expect(mocks.updateSet).toHaveBeenCalledWith({ fcmTokens: ["token-vivo"] });
  });

  it("token válido: no toca la base", async () => {
    mocks.send.mockResolvedValue(undefined);
    await sendPushNotificationAndPrune(2, "token-vivo", "Título", "Cuerpo");
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
});
