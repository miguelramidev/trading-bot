import crypto from "crypto";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

// Busca el header sin distinguir mayúsculas (API Gateway v2 los baja a minúsculas).
export function getSecretHeader(headers: Record<string, string | undefined> | undefined): string | undefined {
  if (!headers) return undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === SECRET_HEADER) return value;
  }
  return undefined;
}

// Comparación en tiempo constante. Falla cerrado: sin header o sin secret configurado, rechaza.
// Se hashean ambos valores para que timingSafeEqual reciba siempre buffers de igual largo.
export function isValidWebhookSecret(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = crypto.createHash("sha256").update(received).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
