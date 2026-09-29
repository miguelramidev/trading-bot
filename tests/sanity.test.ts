import { describe, it, expect, vi } from 'vitest';

describe('Sanity Check', () => {
  it('Debería compilar y no tener errores sintácticos', async () => {
    // encryption.ts exige ENCRYPTION_KEY al importarse (sin valor por defecto): llave falsa, solo para el test.
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    // Si podemos importar analyze sin que lance un ReferenceError global, estamos bien.
    const analyze = await import('../src/cron/analyze.js');
    expect(analyze.handler15m).toBeDefined();
  });
});
