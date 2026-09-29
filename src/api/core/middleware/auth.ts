import type { MiddlewareHandler } from "hono";
import { internalError } from "../utils/errors.js";

export type AuthEnv = {
  Variables: {
    uid: string;
    email?: string;
    name?: string;
  };
};

export interface VerifiedToken {
  uid: string;
  email?: string;
  name?: string;
}

interface AuthDeps {
  // Verifica la firma y vigencia del ID token de Firebase; lanza si no es válido.
  verifyToken: (token: string) => Promise<VerifiedToken>;
  // Uids permitidos. Un Set vacío significa que no se permite a nadie (falla cerrado).
  getAllowedUids: () => Set<string>;
}

// El uid sale SOLO del token verificado, nunca del header crudo ni del body.
export function createAuthMiddleware(deps: AuthDeps): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const parts = c.req.header("Authorization")?.split(" ");
    if (!parts || parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let decoded: VerifiedToken;
    try {
      decoded = await deps.verifyToken(parts[1]);
    } catch (error: any) {
      // Firebase Admin sin inicializar es un problema de configuración, no un token malo.
      if (error?.code === "app/no-app") {
        return internalError(c, error, "auth: Firebase Admin no está inicializado");
      }
      // Solo el código del error: nunca el token.
      console.warn(`[auth] Token rechazado: ${error?.code ?? "desconocido"}`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const allowed = deps.getAllowedUids();
    if (allowed.size === 0) {
      console.error("[auth] ALLOWED_FIREBASE_UIDS no está configurado: se rechaza todo (falla cerrado)");
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!allowed.has(decoded.uid)) {
      console.warn(`[auth] Uid verificado pero no permitido: ${decoded.uid}`);
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("uid", decoded.uid);
    if (decoded.email) c.set("email", decoded.email);
    if (decoded.name) c.set("name", decoded.name);
    await next();
  };
}
