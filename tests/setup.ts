import { vi } from "vitest";

// setupFiles global de Vitest: corre antes de cada archivo de test, antes de sus
// imports. El objetivo es que `pnpm test` a secas sea seguro y dé el mismo
// resultado que `env -i PATH="$PATH" pnpm test`, sin depender de `sst dev` activo
// ni de credenciales reales exportadas a mano en la shell.
//
// Cubre el patrón dual `process.env.X || (Resource as any).X.value` que usa
// todo el código de src/ (ver CLAUDE.md): al estar seteado el env var, el `||`
// nunca llega a evaluar `Resource`, así que ni falta wrappear "sst" acá. Si un
// test importa un módulo nuevo que lee otra variable al cargarse, agregarla acá
// (con `??=`, para no pisar un `vi.stubEnv` que un test haga a propósito).
const FAKE_ENV: Record<string, string> = {
  TELEGRAM_TOKEN: "telegram-token-de-test",
  TELEGRAM_WEBHOOK_SECRET: "telegram-webhook-secret-de-test",
  ALLOWED_CHAT_IDS: "0",
  ALLOWED_FIREBASE_UIDS: "uid-de-test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  // 64 hex = 32 bytes, como exige encryption.ts. No es una llave real.
  ENCRYPTION_KEY: "ab".repeat(32),
  BINANCE_API_KEY: "binance-api-key-de-test",
  BINANCE_API_SECRET: "binance-api-secret-de-test",
  // Base64 de un service account con forma válida pero credenciales falsas:
  // firebase.ts intenta parsearlo e inicializar Firebase Admin; si falla, lo
  // loguea y sigue en modo no-op (ver firebase.ts), nunca revienta el import.
  FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from(
    JSON.stringify({
      project_id: "proyecto-de-test",
      client_email: "test@proyecto-de-test.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
    })
  ).toString("base64"),
};

for (const [key, value] of Object.entries(FAKE_ENV)) {
  process.env[key] ??= value;
}

// Ningún test debería tocar la red real: si algo se escapa de su propio mock
// (ccxt, db, telegraf, firebase-admin), que falle fuerte contra un fetch que
// explota, no calladamente contra Binance/Neon/Telegram/Firebase reales.
vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    throw new Error(
      "Llamada de red real bloqueada por tests/setup.ts: a este test le falta mockear algo."
    );
  })
);
