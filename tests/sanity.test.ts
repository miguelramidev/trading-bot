import { describe, it, expect } from 'vitest';

describe('Sanity Check', () => {
  it('Debería compilar y no tener errores sintácticos', async () => {
    // Si podemos importar analyze sin que lance un ReferenceError global, estamos bien.
    const analyze = await import('../src/cron/analyze.js');
    expect(analyze.handler15m).toBeDefined();
  });
});
