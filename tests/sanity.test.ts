import { describe, it, expect } from 'vitest';

describe('Sanity Check', () => {
  it('Debería compilar y no tener errores sintácticos', async () => {
    // Las variables falsas (ENCRYPTION_KEY, DATABASE_URL, TELEGRAM_TOKEN,
    // FIREBASE_SERVICE_ACCOUNT_B64, etc.) las pone tests/setup.ts como
    // setupFiles global: `pnpm test` a secas ya es seguro por defecto y no
    // depende de `sst dev` ni de credenciales reales.
    const analyze = await import('../src/cron/analyze.js');
    expect(analyze.handler15m).toBeDefined();
  });
});
