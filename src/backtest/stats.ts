// Estadística para decidir si un resultado es edge o ruido de selección.
//   - Probabilistic / Deflated Sharpe Ratio (Bailey & López de Prado, 2014): probabilidad de que el
//     Sharpe verdadero supere al máximo que se esperaría por azar habiendo probado N variantes.
//   - Monte Carlo por bloques de la curva diaria: distribución del drawdown máximo (el histórico
//     es un solo camino; el percentil 95 es el que se compara contra el 25 % tolerado).
// Todo sobre retornos DIARIOS sin anualizar.

const EULER_GAMMA = 0.5772156649015329;

/** Función de distribución acumulada de la normal estándar (Abramowitz–Stegun 7.1.26 vía erf). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Inversa de la normal estándar (algoritmo de Acklam, error relativo < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`normInv: p fuera de (0,1): ${p}`);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Moments {
  mean: number;
  std: number;
  skew: number;
  /** Curtosis (no exceso): 3 para una normal. */
  kurtosis: number;
}

export function moments(xs: number[]): Moments {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const std = Math.sqrt(m2);
  return { mean, std, skew: std > 0 ? m3 / std ** 3 : 0, kurtosis: std > 0 ? m4 / m2 ** 2 : 3 };
}

/**
 * Probabilistic Sharpe Ratio: P(SR verdadero > srBenchmark) dado el SR observado sobre `t`
 * observaciones con asimetría y curtosis dadas. SR sin anualizar (mismas unidades que los retornos).
 */
export function probabilisticSharpe(sr: number, srBenchmark: number, t: number, skew: number, kurtosis: number): number {
  const denom = Math.sqrt(1 - skew * sr + ((kurtosis - 1) / 4) * sr * sr);
  return normCdf(((sr - srBenchmark) * Math.sqrt(t - 1)) / denom);
}

/** Sharpe máximo esperado por azar entre `nTrials` variantes cuyo SR tiene varianza `srVariance`. */
export function expectedMaxSharpe(nTrials: number, srVariance: number): number {
  if (nTrials < 2) return 0;
  return Math.sqrt(srVariance) * ((1 - EULER_GAMMA) * normInv(1 - 1 / nTrials) + EULER_GAMMA * normInv(1 - 1 / (nTrials * Math.E)));
}

/** Deflated Sharpe Ratio: PSR contra el máximo esperado por azar. ≥ 0.95 es el umbral de aceptación (docs §8.7). */
export function deflatedSharpe(dailyReturns: number[], nTrials: number, trialSrVariance: number): { dsr: number; sr: number; sr0: number } {
  const m = moments(dailyReturns);
  const sr = m.std > 0 ? m.mean / m.std : 0;
  const sr0 = expectedMaxSharpe(nTrials, trialSrVariance);
  return { dsr: probabilisticSharpe(sr, sr0, dailyReturns.length, m.skew, m.kurtosis), sr, sr0 };
}

/** Generador pseudoaleatorio determinístico (mulberry32): mismo seed → mismos resultados. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo por bloques sobre el PnL diario en USDT (margen fijo, sin interés compuesto):
 * remuestrea bloques contiguos de `blockDays` días (conserva las rachas) y devuelve percentiles
 * del drawdown máximo en % del pico de equity, partiendo de `initialEquity`.
 */
export function bootstrapMaxDrawdown(
  dailyPnl: number[],
  initialEquity: number,
  opts: { sims?: number; blockDays?: number; seed?: number } = {}
): { p50: number; p95: number; p99: number; ruinPct: number } {
  const sims = opts.sims ?? 2000;
  const block = opts.blockDays ?? 10;
  const rand = rng(opts.seed ?? 1);
  const n = dailyPnl.length;
  const mdds: number[] = [];
  let ruined = 0;
  for (let s = 0; s < sims; s++) {
    let equity = initialEquity;
    let peak = equity;
    let mdd = 0;
    let filled = 0;
    let dead = false;
    while (filled < n) {
      const start = Math.floor(rand() * (n - block + 1));
      for (let k = 0; k < block && filled < n; k++, filled++) {
        equity += dailyPnl[start + k];
        peak = Math.max(peak, equity);
        mdd = Math.max(mdd, (peak - equity) / peak);
        if (equity <= 0) dead = true;
      }
    }
    if (dead) ruined++;
    mdds.push(mdd * 100);
  }
  mdds.sort((a, b) => a - b);
  const pct = (q: number) => mdds[Math.min(mdds.length - 1, Math.floor(q * mdds.length))];
  return { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), ruinPct: (ruined / sims) * 100 };
}
