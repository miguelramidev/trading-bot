import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { internalError, newErrorId } from "../src/api/core/utils/errors.js";

describe("internalError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("responde 500 genérico con id y deja el detalle solo en el log", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Hono();
    app.get("/falla", (c) => internalError(c, new Error("password de la base: hunter2"), "prueba"));

    const res = await app.request("/falla");
    const text = await res.text();
    const body = JSON.parse(text);

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Error interno", errorId: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(text).not.toContain("hunter2");

    // El log sí tiene el detalle, asociado al mismo id que ve el cliente.
    const [mensaje, error] = logSpy.mock.calls[0];
    expect(mensaje).toContain(body.errorId);
    expect(mensaje).toContain("prueba");
    expect((error as Error).message).toContain("hunter2");
  });

  it("genera ids distintos", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newErrorId()));
    expect(ids.size).toBe(50);
  });
});
