// Familia cross-sectional, opción B (docs §13): rotación semanal hacia las monedas grandes que
// vienen ganándole a BTC, solo con el mercado en tendencia.
//
// Tesis: en cripto el capital y la atención rotan hacia las monedas grandes que vienen ganando
// frente a BTC, y ese impulso relativo persiste 1–4 semanas antes de revertir (Liu, Tsyvinski &
// Wu 2022; Dobrynskaya); solo vale la pena estar comprado cuando el mercado está en tendencia.
//
// Reglas fijas (pre-registradas, no se varían):
//   - TF 1d; decisiones solo en el cierre del domingo (lunes 00:00 UTC = domingo 21:00 PYT).
//   - Universo: top 30 por volumen (point-in-time). Ranking por el score de la variante.
//   - Filtro de mercado: BTC diario > SMA200. Si no, se sale de todo en el rebalanceo.
//   - Entrada: monedas del top K que no estén en cartera, hasta K posiciones.
//   - Salida en el rebalanceo: si la moneda cae fuera del top 2K (histéresis) o se apaga el filtro.
//   - Stop duro de 2.5 ATR(14) diario desde la entrada.
// Variantes: score (momentum residual vs BTC o retorno crudo), ventana (14/28 días) y K (3/5).
import type { InstrumentData, MarketData, Strategy } from "../engine/types.js";
import { HOUR_MS } from "../data/candles.js";
import { atr } from "../indicators.js";
import { alignDaily, btcAboveSma } from "./common.js";
import { residualMomentum } from "./relativeStrength.js";

const UNIVERSE_TOP = 30;
const BTC_REGIME_SMA = 200;
const STOP_ATR = 2.5;
const BETA_DAYS = 60;

export interface RotationParams {
  score: "residual" | "raw";
  lookbackDays: number;
  topK: number;
}

interface Prepared {
  score: Float64Array;
  regimeOk: Uint8Array;
  isRebalance: Uint8Array;
  atr14: Float64Array;
}

/** ¿La vela diaria `i` cierra en lunes 00:00 UTC (es decir, es la vela del domingo)? */
export function closesOnMonday(dailyOpenTime: number): boolean {
  return new Date(dailyOpenTime + 24 * HOUR_MS).getUTCDay() === 1;
}

/** Retorno crudo de `lookbackDays` días, alineado a las velas diarias. */
export function rawMomentum(close: Float64Array, lookbackDays: number): Float64Array {
  const out = new Float64Array(close.length).fill(NaN);
  for (let k = lookbackDays; k < close.length; k++) out[k] = close[k] / close[k - lookbackDays] - 1;
  return out;
}

export function rotationStrategy(params: RotationParams): Strategy<Prepared> {
  const { score, lookbackDays, topK } = params;
  const id = ["R", "1d", "long", score === "residual" ? "res" : "raw", `l${lookbackDays}`, `k${topK}`].join("_");

  return {
    id,
    family: "cross_sectional",
    timeframeHours: 24,
    side: "long",
    maxRank: UNIVERSE_TOP,
    crossSectionalTopK: topK,
    maxPositions: topK,
    crossSectionalScore: (p, i) => p.score[i],
    prepare(inst: InstrumentData, market: MarketData): Prepared {
      const tf = inst.tf; // en 1d, tf y daily son la misma serie
      const idx = alignDaily(tf, 24, inst.daily);
      const daily = score === "residual" ? residualMomentum(inst.daily, market.btcDaily, lookbackDays, BETA_DAYS) : rawMomentum(inst.daily.close, lookbackDays);
      const s = new Float64Array(tf.length).fill(NaN);
      const isRebalance = new Uint8Array(tf.length);
      for (let i = 0; i < tf.length; i++) {
        if (idx[i] >= 0) s[i] = daily[idx[i]];
        isRebalance[i] = closesOnMonday(tf.openTime[i]) ? 1 : 0;
      }
      return { score: s, regimeOk: btcAboveSma(tf, 24, market.btcDaily, BTC_REGIME_SMA), isRebalance, atr14: atr(tf.high, tf.low, tf.close, 14) };
    },
    entry(p, i) {
      // El motor ya limita a las del top K del ranking; acá solo el reloj semanal y el filtro.
      if (!p.isRebalance[i] || !p.regimeOk[i] || !(p.atr14[i] > 0)) return null;
      return { score: p.score[i] };
    },
    plan: (p, i, entryPrice) => ({ stop: entryPrice - STOP_ATR * p.atr14[i] }),
    exitSignal(p, i, pos) {
      if (!p.isRebalance[i]) return false;
      if (!p.regimeOk[i]) return true;
      return pos.csRank === undefined || pos.csRank > 2 * topK;
    },
  };
}
