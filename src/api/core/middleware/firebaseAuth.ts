import { getAuth } from "firebase-admin/auth";
import { Resource } from "sst";
import "../../../firebase.js"; // inicializa firebase-admin (efecto de lado)
import { createAuthMiddleware } from "./auth.js";
import { parseAllowlist } from "../utils/allowlist.js";

// Si el secret no está disponible (no linkeado o sin setear) devuelve un Set vacío y el middleware rechaza todo.
function getAllowedUids(): Set<string> {
  try {
    return parseAllowlist(process.env.ALLOWED_FIREBASE_UIDS || (Resource as any).ALLOWED_FIREBASE_UIDS?.value);
  } catch {
    return new Set();
  }
}

export const authMiddleware = createAuthMiddleware({
  verifyToken: async (token) => {
    // checkRevoked = false: la lista de permitidos ya limita quién entra y evita una llamada extra a Firebase por request.
    const decoded = await getAuth().verifyIdToken(token, false);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    };
  },
  getAllowedUids,
});
