// Revisiones pre-registradas en docs/investigacion/2026-10-07-torneo.md (no operan ni eligen
// parámetros): retorno futuro ajustado por mercado por decil de cada señal, en el top 30 y en las
// monedas 31–60 (réplica incorporada).
//
//   TOP_A: z-score de 30 días del ratio de cuentas top traders (se espera que el retorno suba con la señal).
//   TOP_B: z(top) − z(todas las cuentas) (se espera que el retorno suba con la divergencia).
//   OIF:   en velas de 4h con retorno negativo, cambio log del open interest en la vela; se espera
//          mayor retorno a 24 h en el decil de mayor caída del OI (D1).
//
// El t "corregido" divide el t agrupado por fecha por √(horizonte en velas), porque las ventanas de
// retorno futuro de velas consecutivas se superponen.
//
// Correr: npx tsx src/backtest/analysis/screens.ts [--from=2022-02-01] [--to=2025-10-01]
import { loadUniverse, loadMarket } from "../context.js";
import { universeAt } from "../universe.js";
import { HOUR_MS } from "../data/candles.js";
import { rollingZ, sampleAtClose, MAX_METRIC_AGE_MS } from "../strategies/positioning.js";
import { arg } from "../data/binanceVision.js";
import type { InstrumentData } from "../engine/types.js";

const TF = 4;
const GROUPS = [{ name: "top 30", from: 1, to: 30 }, { name: "31–60", from: 31, to: 60 }];

interface Obs { date: number; x: number; adj: number }

interface Screen {
  name: string;
  horizon: number;
  /** "up": se espera retorno creciente con la señal (D10 > D1); "down": D1 > D10. */
  expected: "up" | "down";
  /** Valor de la señal en la vela i (NaN = no aplica). */
  signal(inst: InstrumentData, i: number, cache: Map<string, Record<string, Float64Array>>): number;
}

function series(inst: InstrumentData, cache: Map<string, Record<string, Float64Array>>): Record<string, Float64Array> {
  let s = cache.get(inst.id);
  if (s) return s;
  const tf = inst.tf;
  const m = inst.metrics!;
  const t = m.time;
  const ls = sampleAtClose(tf, TF, t, m.lsAccount, MAX_METRIC_AGE_MS);
  const top = sampleAtClose(tf, TF, t, m.topAccount, MAX_METRIC_AGE_MS);
  const oi = sampleAtClose(tf, TF, t, m.openInterest, MAX_METRIC_AGE_MS);
  const zLs = rollingZ(ls);
  const zTop = rollingZ(top);
  const oiChg = new Float64Array(tf.length).fill(NaN);
  for (let i = 1; i < tf.length; i++) if (oi[i] > 0 && oi[i - 1] > 0) oiChg[i] = Math.log(oi[i] / oi[i - 1]);
  s = { zLs, zTop, oiChg };
  cache.set(inst.id, s);
  return s;
}

const SCREENS: Screen[] = [
  { name: "TOP_A · z(top traders)", horizon: 18, expected: "up", signal: (inst, i, c) => series(inst, c).zTop[i] },
  { name: "TOP_B · z(top) − z(todas)", horizon: 18, expected: "up", signal: (inst, i, c) => { const s = series(inst, c); return s.zTop[i] - s.zLs[i]; } },
  {
    name: "OIF · ΔOI en velas bajistas", horizon: 6, expected: "down",
    signal: (inst, i, c) => (inst.tf.close[i] < inst.tf.open[i] ? series(inst, c).oiChg[i] : NaN),
  },
];

function clustered(xs: Obs[]) {
  const byDate = new Map<number, number[]>();
  for (const o of xs) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o.adj]);
  const means = [...byDate.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const m = means.reduce((a, b) => a + b, 0) / means.length;
  const sd = Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(means.length - 1, 1));
  return { mean: m, se: sd / Math.sqrt(means.length), n: xs.length };
}

function main() {
  const from = Date.parse(`${arg("from") ?? "2022-02-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2025-10-01"}T00:00:00Z`);
  const universe = loadUniverse();
  const { instruments } = loadMarket(universe, TF, from, to, { metrics: true });
  const cache = new Map<string, Record<string, Float64Array>>();
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

  for (const screen of SCREENS) {
    console.log(`\n######## ${screen.name} (horizonte ${screen.horizon * TF} h, se espera ${screen.expected === "up" ? "D10 > D1" : "D1 > D10"})`);
    for (const g of GROUPS) {
      // Retorno futuro de cada (vela, moneda) del grupo, y su ajuste por el promedio del grupo en esa vela.
      const byDate = new Map<number, { x: number; ret: number }[]>();
      for (const inst of instruments.values()) {
        if (!inst.metrics || inst.metrics.time.length === 0) continue;
        const tf = inst.tf;
        for (let i = 0; i + screen.horizon < tf.length; i++) {
          const close = tf.openTime[i] + TF * HOUR_MS;
          if (close < from || close >= to) continue;
          const snap = universeAt(universe, close);
          const rank = snap ? snap.ranked.indexOf(inst.id) + 1 : 0;
          if (rank < g.from || rank > g.to) continue;
          const entry = tf.open[i + 1];
          const exit = tf.close[i + screen.horizon];
          if (!(entry > 0 && exit > 0)) continue;
          const ret = Math.log(exit / entry);
          // El ajuste por mercado usa todas las monedas del grupo en esa vela, haya señal o no.
          const x = screen.signal(inst, i, cache);
          const list = byDate.get(close) ?? [];
          list.push({ x, ret });
          byDate.set(close, list);
        }
      }
      const obs: Obs[] = [];
      for (const [date, list] of byDate) {
        if (list.length < 5) continue;
        const mkt = list.reduce((s, o) => s + o.ret, 0) / list.length;
        for (const o of list) if (Number.isFinite(o.x)) obs.push({ date, x: o.x, adj: o.ret - mkt });
      }
      const sorted = obs.sort((a, b) => a.x - b.x);
      const dec = Array.from({ length: 10 }, (_, k) => sorted.slice(Math.floor((k * sorted.length) / 10), Math.floor(((k + 1) * sorted.length) / 10)));
      const stats = dec.map(clustered);
      const extreme = screen.expected === "up" ? stats[9] : stats[0];
      const sign = screen.expected === "up" ? 1 : -1;
      const tCorr = extreme.mean / extreme.se / Math.sqrt(screen.horizon);
      // Diferencia D10 − D1 en la dirección esperada.
      const spread = sign * (stats[9].mean - stats[0].mean);
      console.log(`  [${g.name}] ${obs.length} obs | por decil: ${stats.map((s) => pct(s.mean)).join(" ")}`);
      console.log(`    decil extremo esperado: ${pct(extreme.mean)} (t corregido ${tCorr.toFixed(2)}) | D10 − D1 en la dirección esperada: ${pct(spread)}`);
    }
  }
}

main();
