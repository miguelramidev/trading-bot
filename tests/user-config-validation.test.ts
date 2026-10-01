import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../src/api/core/middleware/auth.js";

// Sin red ni DB real: db y ccxt mockeados (mismo patrón que telegram-webhook.test.ts).
const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("../src/db/index.js", () => ({
  db: {
    query: { userConfig: { findFirst: mocks.userFindFirst } },
    update: () => ({ set: () => ({ where: () => ({ returning: mocks.updateReturning }) }) }),
  },
}));
vi.mock("../src/api/core/utils/encryption.js", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ""),
}));
vi.mock("ccxt", () => ({ default: { binance: class {} } }));

vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
const { usersRouter } = await import("../src/api/modules/users/infrastructure/UserController.js");

function makeApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("uid", "uid-de-test");
    await next();
  });
  app.route("/api/users", usersRouter);
  return app;
}

function putConfig(body: Record<string, unknown>) {
  return makeApp().request("/api/users/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/users/config — validación combinada (hallazgo M6)", () => {
  beforeEach(() => {
    mocks.userFindFirst.mockReset();
    mocks.updateReturning.mockReset().mockResolvedValue([{ id: 1 }]);
  });

  it("rechaza un PUT que solo manda leverageMax por debajo del leverageMin ya guardado", async () => {
    mocks.userFindFirst.mockResolvedValue({ leverageMin: 8, leverageMax: 10, montoOperacion: 25, maxTrades: 5 });
    const res = await putConfig({ leverageMax: 5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("leverageMin");
    expect(mocks.updateReturning).not.toHaveBeenCalled();
  });

  it("acepta un PUT que ajusta ambos leverage de forma consistente entre sí", async () => {
    mocks.userFindFirst.mockResolvedValue({ leverageMin: 8, leverageMax: 10, montoOperacion: 25, maxTrades: 5 });
    const res = await putConfig({ leverageMin: 2, leverageMax: 5 });
    expect(res.status).toBe(200);
  });

  it("un PUT que no toca capital/riesgo no revalida datos viejos ya guardados fuera de los topes nuevos", async () => {
    // maxTrades: 20 es un dato previo a esta validación (el tope nuevo es 10) — no debe bloquear un cambio no relacionado.
    mocks.userFindFirst.mockResolvedValue({ leverageMin: 1, leverageMax: 2, montoOperacion: 25, maxTrades: 20 });
    const res = await putConfig({ notificationsWeb: false });
    expect(res.status).toBe(200);
  });

  it("404 si el usuario no existe", async () => {
    mocks.userFindFirst.mockResolvedValue(undefined);
    const res = await putConfig({ leverageMax: 5 });
    expect(res.status).toBe(404);
  });

  it("el zValidator de forma ya rechaza un leverage fuera de 1-10 antes de llegar a la validación combinada", async () => {
    const res = await putConfig({ leverageMax: 15 });
    expect(res.status).toBe(400);
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });
});
