// Familia reversión (la única variante con respaldo en un top 100, ver docs §4): comprar un
// retroceso brusco DENTRO de una tendencia alcista (estilo RSI(2) de Connors).
//   Condición de régimen: cierre diario de la moneda > SMA200 diaria Y BTC diario > SMA200.
//   Entrada: RSI(2) del TF de señal < L.
//   Salida: RSI(2) > 70, o cierre > SMA5 (según variante), al open de la vela siguiente; stop
//   duro de 2.5 ATR y corte por tiempo de 10 velas.
// El short es el espejo (régimen bajista, RSI(2) > 100 − L), solo como información.
import type { Side } from "../engine/exits.js";
import type { InstrumentData, MarketData, Strategy } from "../engine/types.js";
import { atr, rsi, sma } from "../indicators.js";
import { alignDaily, btcAboveSma } from "./common.js";

export interface Rsi2Params {
  timeframeHours: 4 | 24;
  side: Side;
  /** Umbral de entrada (long: RSI(2) < L). */
  l: number;
  exitRule: "rsi70" | "sma5";
  stopAtr: number;
  maxBars: number;
}

interface Prepared {
  close: Float64Array;
  rsi2: Float64Array;
  sma5: Float64Array;
  atr14: Float64Array;
  regimeOk: Uint8Array;
}

export function rsi2PullbackStrategy(params: Rsi2Params): Strategy<Prepared> {
  const { side, l, exitRule, stopAtr, maxBars, timeframeHours } = params;
  const s = side === "long" ? 1 : -1;
  const id = ["M1", timeframeHours === 24 ? "1d" : "4h", side, `l${l}`, exitRule, `stop${stopAtr}`, `t${maxBars}`].join("_");

  return {
    id,
    family: "reversion",
    timeframeHours,
    side,
    maxBars,
    prepare(inst: InstrumentData, market: MarketData): Prepared {
      const tf = inst.tf;
      const idx = alignDaily(tf, timeframeHours, inst.daily);
      const sma200 = sma(inst.daily.close, 200);
      const btcUp = btcAboveSma(tf, timeframeHours, market.btcDaily, 200);
      const regimeOk = new Uint8Array(tf.length);
      for (let i = 0; i < tf.length; i++) {
        const k = idx[i];
        const coinTrend = k >= 0 && s * inst.daily.close[k] > s * sma200[k];
        const btcTrend = side === "long" ? btcUp[i] === 1 : btcUp[i] === 0;
        regimeOk[i] = coinTrend && btcTrend ? 1 : 0;
      }
      return { close: tf.close, rsi2: rsi(tf.close, 2), sma5: sma(tf.close, 5), atr14: atr(tf.high, tf.low, tf.close, 14), regimeOk };
    },
    entry(p, i) {
      if (!p.regimeOk[i] || !(p.atr14[i] > 0)) return null;
      const r = p.rsi2[i];
      const triggered = side === "long" ? r < l : r > 100 - l;
      if (!triggered) return null;
      // Prioridad: retroceso más extremo primero.
      return { score: side === "long" ? l - r : r - (100 - l) };
    },
    plan: (p, i, entryPrice) => ({ stop: entryPrice - s * stopAtr * p.atr14[i] }),
    exitSignal(p, i) {
      if (exitRule === "rsi70") return side === "long" ? p.rsi2[i] > 70 : p.rsi2[i] < 30;
      return s * p.close[i] > s * p.sma5[i];
    },
  };
}
