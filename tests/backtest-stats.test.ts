import { describe, it, expect } from "vitest";
import { normCdf, normInv, moments, probabilisticSharpe, expectedMaxSharpe, deflatedSharpe, bootstrapMaxDrawdown, rng } from "../src/backtest/stats.js";

describe("normal estándar", () => {
  it("cdf en valores conocidos", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normCdf(-1.644854)).toBeCloseTo(0.05, 5);
  });

  it("inv es la inversa de cdf", () => {
    for (const p of [0.001, 0.05, 0.3, 0.5, 0.9, 0.999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 6);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
  });
});

describe("moments", () => {
  it("serie simétrica: asimetría 0", () => {
    const m = moments([-2, -1, 0, 1, 2]);
    expect(m.mean).toBe(0);
    expect(m.skew).toBeCloseTo(0, 10);
  });
});

describe("Sharpe probabilístico / deflactado", () => {
  it("PSR = 0.5 cuando el SR observado es igual al de referencia", () => {
    expect(probabilisticSharpe(0.1, 0.1, 1000, 0, 3)).toBeCloseTo(0.5, 6);
  });

  it("más observaciones → más confianza en el mismo SR", () => {
    expect(probabilisticSharpe(0.05, 0, 2000, 0, 3)).toBeGreaterThan(probabilisticSharpe(0.05, 0, 200, 0, 3));
  });

  it("el máximo esperado por azar crece con la cantidad de variantes probadas", () => {
    expect(expectedMaxSharpe(1, 0.01)).toBe(0);
    expect(expectedMaxSharpe(50, 0.01)).toBeGreaterThan(expectedMaxSharpe(10, 0.01));
    // Ejemplo del paper: N = 100, V[SR] = 1 → E[max] ≈ 2.53
    expect(expectedMaxSharpe(100, 1)).toBeCloseTo(2.5306, 2);
  });

  it("probar más variantes deflacta el mismo resultado", () => {
    const r = rng(7);
    const rets = Array.from({ length: 1500 }, () => 0.001 + (r() - 0.5) * 0.04);
    expect(deflatedSharpe(rets, 50, 0.0004).dsr).toBeLessThan(deflatedSharpe(rets, 2, 0.0004).dsr);
  });
});

describe("bootstrapMaxDrawdown", () => {
  it("una curva que nunca pierde tiene drawdown 0 en todas las simulaciones", () => {
    const res = bootstrapMaxDrawdown(Array(300).fill(1), 100, { sims: 200 });
    expect(res.p95).toBe(0);
    expect(res.ruinPct).toBe(0);
  });

  it("es determinístico con el mismo seed y el p95 ≥ p50", () => {
    const r = rng(3);
    const pnl = Array.from({ length: 500 }, () => (r() - 0.48) * 10);
    const a = bootstrapMaxDrawdown(pnl, 300, { sims: 300, seed: 9 });
    const b = bootstrapMaxDrawdown(pnl, 300, { sims: 300, seed: 9 });
    expect(a).toEqual(b);
    expect(a.p95).toBeGreaterThanOrEqual(a.p50);
  });
});
