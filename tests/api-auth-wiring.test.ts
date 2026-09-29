import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../src/api/core/middleware/auth.js";

// Cableado real (firebaseAuth.ts) con firebase-admin y sst mockeados: sin red ni credenciales.
const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  resource: {} as any,
}));

vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock("../src/firebase.js", () => ({}));
vi.mock("sst", () => ({ Resource: mocks.resource }));

const { authMiddleware } = await import("../src/api/core/middleware/firebaseAuth.js");

function makeApp() {
  const app = new Hono<AuthEnv>();
  app.use("/api/*", authMiddleware);
  app.get("/api/ping", (c) => c.json({ uid: c.get("uid") }));
  return app;
}

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe("authMiddleware (cableado con firebase-admin mockeado)", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_FIREBASE_UIDS", "uid-a, uid-b");
    mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: "uid-a", email: "a@example.com", name: "A" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("ALLOWED_FIREBASE_UIDS", "");
  });

  it("verifica el token con verifyIdToken sin checkRevoked y deja pasar a un uid permitido", async () => {
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: "uid-a" });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("token-valido", false);
  });

  it("token inválido: 401", async () => {
    mocks.verifyIdToken.mockRejectedValue(Object.assign(new Error("malo"), { code: "auth/invalid-id-token" }));
    const res = await makeApp().request("/api/ping", bearer("token-malo"));
    expect(res.status).toBe(401);
  });

  it("uid verificado que no está en la lista: 403", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "uid-c" });
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(403);
  });

  it("sin ALLOWED_FIREBASE_UIDS configurado: 403 (falla cerrado)", async () => {
    vi.stubEnv("ALLOWED_FIREBASE_UIDS", "");
    const res = await makeApp().request("/api/ping", bearer("token-valido"));
    expect(res.status).toBe(403);
  });

  it("un uid en crudo como Bearer no se acepta: se manda a verifyIdToken y este lo rechaza", async () => {
    mocks.verifyIdToken.mockRejectedValue(Object.assign(new Error("no es un JWT"), { code: "auth/argument-error" }));
    const res = await makeApp().request("/api/ping", bearer("uid-a"));
    expect(res.status).toBe(401);
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("uid-a", false);
  });
});
