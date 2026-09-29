import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createAuthMiddleware, type AuthEnv } from "../src/api/core/middleware/auth.js";
import { parseAllowlist } from "../src/api/core/utils/allowlist.js";

// Sin red ni Firebase real: el verificador de tokens es un mock.
const UID = "uid-permitido";
const verifyToken = vi.fn();
let allowed: Set<string>;

function makeApp() {
  const app = new Hono<AuthEnv>();
  app.get("/", (c) => c.json({ status: "ok" }));
  app.use("/api/*", createAuthMiddleware({ verifyToken, getAllowedUids: () => allowed }));
  app.get("/api/ping", (c) => c.json({ uid: c.get("uid"), email: c.get("email") ?? null }));
  app.post("/api/echo", async (c) => {
    const body = await c.req.json();
    return c.json({ uidFromContext: c.get("uid"), uidFromBody: body.firebaseUid });
  });
  return app;
}

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe("middleware de autenticación", () => {
  beforeEach(() => {
    allowed = new Set([UID]);
    verifyToken.mockReset().mockResolvedValue({ uid: UID, email: "yo@example.com" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("token ausente: 401 y no se llama al verificador", async () => {
    const res = await makeApp().request("/api/ping");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("esquema o formato inválido: 401 y no se llama al verificador", async () => {
    for (const header of ["Basic abc", "Bearer", "Bearer a b", "", "abc"]) {
      const res = await makeApp().request("/api/ping", { headers: { Authorization: header } });
      expect(res.status).toBe(401);
    }
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("token inválido: 401 sin detalles del error", async () => {
    verifyToken.mockRejectedValue(Object.assign(new Error("detalle interno secreto"), { code: "auth/argument-error" }));
    const res = await makeApp().request("/api/ping", bearer("token-malo"));
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(JSON.parse(text)).toEqual({ error: "Unauthorized" });
    expect(text).not.toContain("secreto");
  });

  it("un uid en crudo como Bearer (el ataque anterior) da 401 porque no es un token verificable", async () => {
    verifyToken.mockRejectedValue(Object.assign(new Error("no es un JWT"), { code: "auth/argument-error" }));
    const res = await makeApp().request("/api/ping", bearer(UID));
    expect(res.status).toBe(401);
    expect(verifyToken).toHaveBeenCalledWith(UID);
  });

  it("token válido con uid no permitido: 403", async () => {
    verifyToken.mockResolvedValue({ uid: "otro-uid", email: "otro@example.com" });
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("token válido con uid permitido: 200 y el uid sale del token", async () => {
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: UID, email: "yo@example.com" });
    expect(verifyToken).toHaveBeenCalledWith("token-valido");
  });

  it("el uid sale solo del token: un firebaseUid en el body no lo cambia", async () => {
    const res = await makeApp().request("/api/echo", {
      method: "POST",
      headers: { Authorization: "Bearer token-valido", "Content-Type": "application/json" },
      body: JSON.stringify({ firebaseUid: "uid-de-la-victima" }),
    });
    expect(await res.json()).toEqual({ uidFromContext: UID, uidFromBody: "uid-de-la-victima" });
  });

  it("falla cerrado: sin lista de permitidos rechaza incluso un token válido", async () => {
    allowed = new Set();
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(403);
  });

  it("si Firebase Admin no está inicializado responde 500 genérico con id de error", async () => {
    verifyToken.mockRejectedValue(Object.assign(new Error("detalle interno secreto"), { code: "app/no-app" }));
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Error interno", errorId: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(text).not.toContain("secreto");
  });

  it("la ruta pública GET / responde sin token", async () => {
    const res = await makeApp().request("/");
    expect(res.status).toBe(200);
  });
});

describe("parseAllowlist", () => {
  it("separa por comas, recorta espacios y descarta vacíos y duplicados", () => {
    expect([...parseAllowlist(" a , b,,c ,a ")]).toEqual(["a", "b", "c"]);
  });

  it("ausente o vacía da un Set vacío", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
    expect(parseAllowlist(" , ").size).toBe(0);
  });
});
