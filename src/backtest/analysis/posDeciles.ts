// Verificación del mecanismo de POS (docs/investigacion/2026-10-06-tres-lineas.md): ¿el retorno
// futuro baja de forma ordenada a medida que sube la saturación de largos (zLS)? No elige
// parámetros ni es una variante: describe la relación señal → retorno en todo el rango de zLS.
//
// Para cada vela de 4h de cada moneda del top 30 vigente: zLS al cierre (igual que la
// estrategia) y retorno desde el open siguiente hasta H velas después. Se reporta por decil de
// zLS: retorno crudo y ajustado por mercado (menos el promedio del top 30 en esa misma vela), con
// error estándar agrupado por fecha (las observaciones de una misma vela no son independientes).
//
// Correr: npx tsx src/backtest/analysis/posDeciles.ts [--from=2022-02-01] [--to=2025-10-01] [--h=18] [--rank-from=1] [--rank-to=30]
import { loadUniverse, loadMarket } from "../context.js";
import { universeAt } from "../universe.js";
import { HOUR_MS } from "../data/candles.js";
import { rollingZ, sampleAtClose, MAX_METRIC_AGE_MS } from "../strategies/positioning.js";
import { arg } from "../data/binanceVision.js";

const TF = 4;
const RANK_FROM = Number(arg("rank-from") ?? 1);
const RANK_TO = Number(arg("rank-to") ?? 30);

interface Obs {
  date: number;
  z: number;
  ret: number;
  adj: number;
}

function main() {
  const from = Date.parse(`${arg("from") ?? "2022-02-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2025-10-01"}T00:00:00Z`);
  const H = Number(arg("h") ?? 18);
  const universe = loadUniverse();
  const { instruments } = loadMarket(universe, TF, from, to, { metrics: true });

  // Retornos futuros por (fecha de cierre, instrumento), solo para el top 30 vigente.
  const byDate = new Map<number, { id: string; z: number; ret: number }[]>();
  for (const inst of instruments.values()) {
    const m = inst.metrics;
    if (!m || m.time.length === 0) continue;
    const tf = inst.tf;
    const z = rollingZ(sampleAtClose(tf, TF, m.time, m.lsAccount, MAX_METRIC_AGE_MS));
    for (let i = 0; i + H < tf.length; i++) {
      const close = tf.openTime[i] + TF * HOUR_MS;
      if (close < from || close >= to || !Number.isFinite(z[i])) continue;
      const snap = universeAt(universe, close);
      const rank = snap ? snap.ranked.indexOf(inst.id) + 1 : 0;
      if (rank < RANK_FROM || rank > RANK_TO) continue;
      // Entrada al open de la vela siguiente (i+1), salida al open de i+1+H (≈ cierre de i+H).
      const entry = tf.open[i + 1];
      const exit = tf.close[i + H];
      if (!(entry > 0 && exit > 0)) continue;
      const list = byDate.get(close) ?? [];
      list.push({ id: inst.id, z: z[i], ret: Math.log(exit / entry) });
      byDate.set(close, list);
    }
  }

  const obs: Obs[] = [];
  for (const [date, list] of byDate) {
    if (list.length < 5) continue;
    const mkt = list.reduce((s, x) => s + x.ret, 0) / list.length;
    for (const x of list) obs.push({ date, z: x.z, ret: x.ret, adj: x.ret - mkt });
  }
  console.log(`${obs.length} observaciones, ${byDate.size} velas de 4h, horizonte ${H} velas (${H * TF} h).\n`);

  report("Todo el período", obs);
  const years = [...new Set(obs.map((o) => new Date(o.date).getUTCFullYear()))].sort();
  for (const y of years) report(String(y), obs.filter((o) => new Date(o.date).getUTCFullYear() === y), true);
}

/** Media y error estándar agrupado por fecha: se promedia cada fecha y se toma la dispersión entre fechas. */
function clustered(xs: Obs[], key: "ret" | "adj") {
  const byDate = new Map<number, number[]>();
  for (const o of xs) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o[key]]);
  const means = [...byDate.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const m = means.reduce((a, b) => a + b, 0) / means.length;
  const sd = Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(means.length - 1, 1));
  return { mean: m, se: sd / Math.sqrt(means.length), n: xs.length };
}

function report(title: string, obs: Obs[], compact = false) {
  // Deciles fijos de zLS (cortes del período completo darían look-ahead entre años; acá se usan
  // los cortes de cada muestra: es descriptivo, no una regla de trading).
  const sorted = [...obs].sort((a, b) => a.z - b.z);
  const deciles: Obs[][] = Array.from({ length: 10 }, (_, k) => sorted.slice(Math.floor((k * sorted.length) / 10), Math.floor(((k + 1) * sorted.length) / 10)));
  const pct = (x: number) => `${(x * 100 >= 0 ? "+" : "")}${(x * 100).toFixed(2)}%`;
  if (compact) {
    const row = deciles.map((d) => pct(clustered(d, "adj").mean)).join(" ");
    console.log(`${title}: ajustado por decil (D1 = más cortos … D10 = más largos): ${row}`);
    return;
  }
  console.log(`== ${title}`);
  console.log("decil | zLS medio |   N    | retorno crudo (±EE)  | ajustado mercado (±EE)");
  deciles.forEach((d, k) => {
    const zm = d.reduce((s, o) => s + o.z, 0) / d.length;
    const r = clustered(d, "ret");
    const a = clustered(d, "adj");
    console.log(`D${String(k + 1).padEnd(4)} | ${zm.toFixed(2).padStart(8)} | ${String(d.length).padStart(6)} | ${pct(r.mean).padStart(7)} (±${(r.se * 100).toFixed(2)}) | ${pct(a.mean).padStart(7)} (±${(a.se * 100).toFixed(2)})`);
  });
  // Colas que usa la estrategia (|z| > 2), fuera de los deciles.
  for (const [label, sel] of [["zLS < −2 (cortos saturados)", obs.filter((o) => o.z < -2)], ["zLS > +2 (largos saturados)", obs.filter((o) => o.z > 2)]] as const) {
    const a = clustered(sel, "adj");
    console.log(`${label}: N ${a.n}, ajustado ${pct(a.mean)} (±${(a.se * 100).toFixed(2)}), t = ${(a.mean / a.se).toFixed(2)}`);
  }
  console.log();
}

main();
