// Familia tendencia: breakout de canal (Donchian).
//   T1 — 1d: cierre > máximo de los N cierres previos (Zarattini et al. 2025; dimaquant sobre
//        perpetuos de Binance). Filtro opcional de régimen de BTC.
//   T2 — 4h: cierre > máximo de los N highs previos, solo si la moneda está en tendencia diaria
//        (cierre diario > EMA50 diaria, última vela diaria cerrada).
// El lado short es el espejo (se corre solo como información, ver docs §9).
// Solo breakouts "frescos": la vela anterior no estaba ya fuera del canal, para no re-entrar en
// cada vela de una tendencia que ya se operó.
import type { Side } from "../engine/exits.js";
import type { InstrumentData, MarketData, Strategy } from "../engine/types.js";
import { ema, rollingMax, rollingMin, shift } from "../indicators.js";
import { alignDaily, btcAboveSma, buildPlan, botTrailStop, exitArrays, exitLabel, type ExitArrays, type ExitParams } from "./common.js";

export interface BreakoutParams {
  timeframeHours: 4 | 24;
  side: Side;
  /** Velas del canal. */
  n: number;
  exit: ExitParams;
  /** Filtro de BTC: 0 = sin filtro; si no, BTC diario > SMA(btcSma) (long) o < (short). */
  btcSma: number;
  /** Solo 4h: exigir tendencia diaria de la moneda (cierre diario > EMA50 diaria, o < para short). */
  dailyTrendFilter: boolean;
}

interface Prepared {
  close: Float64Array;
  channel: Float64Array; // nivel de ruptura vigente al cierre de i (de las N velas PREVIAS)
  prevChannel: Float64Array;
  btcOk: Uint8Array | null;
  dailyOk: Uint8Array | null;
  exit: ExitArrays;
}

export function breakoutStrategy(params: BreakoutParams): Strategy<Prepared> {
  const { side, n, exit, timeframeHours } = params;
  const s = side === "long" ? 1 : -1;
  const tfLabel = timeframeHours === 24 ? "1d" : "4h";
  const id = [
    timeframeHours === 24 ? "T1" : "T2",
    tfLabel,
    side,
    `n${n}`,
    exitLabel(exit),
    params.btcSma ? `btc${params.btcSma}` : "btc-",
    params.dailyTrendFilter ? "dtf" : "",
  ]
    .filter(Boolean)
    .join("_");

  return {
    id,
    family: "tendencia",
    timeframeHours,
    side,
    prepare(inst: InstrumentData, market: MarketData): Prepared {
      const tf = inst.tf;
      // 1d: canal de cierres (Zarattini). 4h: canal de highs/lows (Turtle).
      const src = timeframeHours === 24 ? tf.close : side === "long" ? tf.high : tf.low;
      const raw = side === "long" ? rollingMax(src, n) : rollingMin(src, n);
      const channel = shift(raw, 1); // solo las N velas previas a i
      let btcOk: Uint8Array | null = null;
      if (params.btcSma) {
        const above = btcAboveSma(tf, timeframeHours, market.btcDaily, params.btcSma);
        btcOk = side === "long" ? above : above.map((v) => 1 - v);
      }
      let dailyOk: Uint8Array | null = null;
      if (params.dailyTrendFilter) {
        const idx = alignDaily(tf, timeframeHours, inst.daily);
        const e50 = ema(inst.daily.close, 50);
        dailyOk = new Uint8Array(tf.length);
        for (let i = 0; i < tf.length; i++) {
          const k = idx[i];
          dailyOk[i] = k >= 0 && s * inst.daily.close[k] > s * e50[k] ? 1 : 0;
        }
      }
      return { close: tf.close, channel, prevChannel: shift(channel, 1), btcOk, dailyOk, exit: exitArrays(tf, side) };
    },
    entry(p, i) {
      if (i < 1) return null;
      const breaks = s * p.close[i] > s * p.channel[i];
      const fresh = !(s * p.close[i - 1] > s * p.prevChannel[i]);
      if (!breaks || !fresh) return null;
      if (p.btcOk && !p.btcOk[i]) return null;
      if (p.dailyOk && !p.dailyOk[i]) return null;
      const a = p.exit.atr[i];
      if (!(a > 0)) return null;
      // Prioridad: fuerza de la ruptura en ATRs.
      return { score: (s * (p.close[i] - p.channel[i])) / a };
    },
    plan: (p, i, entryPrice) => buildPlan(side, exit, p.exit, i, entryPrice),
    updateStop: (p, i) => botTrailStop(side, exit, p.exit, i),
  };
}
