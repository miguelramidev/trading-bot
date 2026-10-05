// Fuerza relativa residual contra BTC (familia cross-sectional, X1 en docs §6): cuánto subió la
// moneda en los últimos L días POR ENCIMA de lo que explica su beta con BTC. Liu, Tsyvinski & Wu
// (2022) encuentran momentum cross-sectional a 1–4 semanas, más fuerte en monedas grandes; usar
// el residual (no el retorno crudo) evita premiar solo a las de beta alta en un mercado alcista.
//
//   r_t = retorno diario de la moneda, b_t = retorno diario de BTC (mismas fechas).
//   β   = cov(r, b) / var(b) sobre los `betaDays` días previos.
//   score_t = Σ_{últimos L días} (r − β·b)
// Todo con velas diarias cerradas: el valor en el índice k usa los días ≤ k.
import type { Series } from "../engine/types.js";

export function residualMomentum(daily: Series, btcDaily: Series, lookbackDays: number, betaDays: number): Float64Array {
  const n = daily.length;
  const out = new Float64Array(n).fill(NaN);
  const btcClose = new Map<number, number>();
  for (let k = 0; k < btcDaily.length; k++) btcClose.set(btcDaily.openTime[k], btcDaily.close[k]);

  // Retornos diarios emparejados por fecha (NaN si falta alguno de los dos días).
  const r = new Float64Array(n).fill(NaN);
  const b = new Float64Array(n).fill(NaN);
  for (let k = 1; k < n; k++) {
    const b0 = btcClose.get(daily.openTime[k - 1]);
    const b1 = btcClose.get(daily.openTime[k]);
    if (b0 === undefined || b1 === undefined) continue;
    r[k] = daily.close[k] / daily.close[k - 1] - 1;
    b[k] = b1 / b0 - 1;
  }

  for (let k = betaDays; k < n; k++) {
    let sr = 0;
    let sb = 0;
    let sbb = 0;
    let srb = 0;
    let cnt = 0;
    for (let j = k - betaDays + 1; j <= k; j++) {
      if (Number.isNaN(r[j]) || Number.isNaN(b[j])) continue;
      sr += r[j];
      sb += b[j];
      sbb += b[j] * b[j];
      srb += r[j] * b[j];
      cnt++;
    }
    if (cnt < betaDays * 0.8) continue; // demasiados huecos para estimar beta
    const varB = sbb / cnt - (sb / cnt) ** 2;
    const beta = varB > 0 ? (srb / cnt - (sr / cnt) * (sb / cnt)) / varB : 1;

    let score = 0;
    let valid = 0;
    for (let j = k - lookbackDays + 1; j <= k; j++) {
      if (Number.isNaN(r[j]) || Number.isNaN(b[j])) continue;
      score += r[j] - beta * b[j];
      valid++;
    }
    if (valid >= lookbackDays * 0.8) out[k] = score;
  }
  return out;
}
