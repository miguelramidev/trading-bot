// Revisión B del pre-registro docs/investigacion/2026-10-07-desbloqueos-y-presente.md: ¿lo que pasa
// "ahora" (flujo de compras agresivas, picos de volumen) anticipa el retorno de las horas
// siguientes? No opera ni elige parámetros.
//
//   FLOW:     taker buy / volumen de las últimas 4 h, z-score de 30 días por moneda.
//   VOLSPIKE: z-score de 30 días del log del volumen de 4 h × signo del retorno de esas 4 h.
// Muestreo al cierre de cada vela de 1h; retorno futuro a 4 h y 24 h (desde el open de la vela
// siguiente), ajustado por el promedio del grupo en esa hora. Grupos: top 30 y monedas 31–60.
// Se informan los deciles, el t corregido (agrupado por hora, ÷ √horizonte) del decil extremo
// y el signo en cada mitad (2022–2023 / 2024–2025).
//
// Correr: npx tsx src/backtest/analysis/presentScreens.ts [--from=2022-02-01] [--to=2025-10-01]
import { loadUniverse } from "../context.js";
import { universeAt } from "../universe.js";
import { loadInstruments } from "../data/store.js";
import { HOUR_MS } from "../data/candles.js";
import { rollingZ } from "../strategies/positioning.js";
import { arg } from "../data/binanceVision.js";

const GROUPS = [{ name: "top 30", from: 1, to: 30 }, { name: "31–60", from: 31, to: 60 }];
const HORIZONS = [4, 24];
const Z_WINDOW = 720; // 30 días de velas de 1h
const Z_MIN = 480;
const SPLIT = Date.parse("2024-01-01T00:00:00Z");

interface Obs { date: Float64Array; x: Float64Array; ret: Float64Array; n: number }
const newObs = (cap: number): Obs => ({ date: new Float64Array(cap), x: new Float64Array(cap), ret: new Float64Array(cap), n: 0 });
function push(o: Obs, date: number, x: number, ret: number) {
  if (o.n === o.date.length) {
    for (const k of ["date", "x", "ret"] as const) { const a = new Float64Array(o.n * 2); a.set(o[k]); (o as any)[k] = a; }
  }
  o.date[o.n] = date; o.x[o.n] = x; o.ret[o.n] = ret; o.n++;
}

/** Media y EE agrupado por fecha de un subconjunto de índices (retornos ya ajustados por mercado). */
function clustered(o: Obs, idx: Int32Array | number[], adj: Float64Array) {
  const byDate = new Map<number, { s: number; c: number }>();
  for (const k of idx) { const d = o.date[k]; const e = byDate.get(d) ?? { s: 0, c: 0 }; e.s += adj[k]; e.c++; byDate.set(d, e); }
  const means = [...byDate.values()].map((e) => e.s / e.c);
  const m = means.reduce((a, b) => a + b, 0) / means.length;
  const sd = Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(means.length - 1, 1));
  return { mean: m, se: sd / Math.sqrt(means.length) };
}

function main() {
  const from = Date.parse(`${arg("from") ?? "2022-02-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2025-10-01"}T00:00:00Z`);
  const universe = loadUniverse();
  const ids = new Set(universe.filter((s) => s.date >= from && s.date < to).flatMap((s) => s.ranked.slice(0, 60)));
  const symbols = [...new Set([...ids].map((id) => id.split("~")[0]))];
  console.log(`Cargando ${symbols.length} símbolos (1h)...`);

  // obs[señal][grupo][horizonte]
  const signals = ["FLOW", "VOLSPIKE"] as const;
  const obs: Record<string, Obs> = {};
  for (const s of signals) for (const g of GROUPS) for (const h of HORIZONS) obs[`${s}|${g.name}|${h}`] = newObs(1 << 20);

  for (const symbol of symbols) {
    for (const inst of loadInstruments(symbol)) {
      if (!ids.has(inst.id)) continue;
      const c = inst.candles1h;
      const n = c.length;
      const flow = new Float64Array(n).fill(NaN);
      const logVol = new Float64Array(n).fill(NaN);
      const ret4 = new Float64Array(n).fill(NaN);
      for (let i = 3; i < n; i++) {
        // Solo ventanas de 4 h contiguas (sin huecos).
        if (c[i].openTime - c[i - 3].openTime !== 3 * HOUR_MS) continue;
        let v = 0, tb = 0;
        for (let k = i - 3; k <= i; k++) { v += c[k].volume; tb += c[k].takerBuyVolume; }
        if (v > 0) { flow[i] = tb / v; logVol[i] = Math.log(v); }
        if (c[i - 3].open > 0) ret4[i] = Math.log(c[i].close / c[i - 3].open);
      }
      const zFlow = rollingZ(flow, Z_WINDOW, Z_MIN);
      const zVol = rollingZ(logVol, Z_WINDOW, Z_MIN);
      for (let i = 0; i < n - 1; i++) {
        const close = c[i].openTime + HOUR_MS;
        if (close < from || close >= to) continue;
        const snap = universeAt(universe, close);
        const rank = snap ? snap.ranked.indexOf(inst.id) + 1 : 0;
        const g = GROUPS.find((x) => rank >= x.from && rank <= x.to);
        if (!g) continue;
        for (const h of HORIZONS) {
          const j = i + h;
          if (j >= n || c[j].openTime !== c[i].openTime + h * HOUR_MS) continue;
          const entry = c[i + 1].open;
          if (!(entry > 0 && c[j].close > 0)) continue;
          const ret = Math.log(c[j].close / entry);
          if (Number.isFinite(zFlow[i])) push(obs[`FLOW|${g.name}|${h}`], close, zFlow[i], ret);
          if (Number.isFinite(zVol[i]) && Number.isFinite(ret4[i]) && ret4[i] !== 0) push(obs[`VOLSPIKE|${g.name}|${h}`], close, zVol[i] * Math.sign(ret4[i]), ret);
        }
      }
    }
    process.stdout.write(".");
  }
  console.log();

  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(3)}%`;
  for (const s of signals) {
    for (const h of HORIZONS) {
      console.log(`\n######## ${s} · horizonte ${h} h`);
      for (const g of GROUPS) {
        const o = obs[`${s}|${g.name}|${h}`];
        // Ajuste por mercado: retorno menos el promedio del grupo en esa hora.
        const sum = new Map<number, { s: number; c: number }>();
        for (let k = 0; k < o.n; k++) { const e = sum.get(o.date[k]) ?? { s: 0, c: 0 }; e.s += o.ret[k]; e.c++; sum.set(o.date[k], e); }
        const adj = new Float64Array(o.n);
        for (let k = 0; k < o.n; k++) { const e = sum.get(o.date[k])!; adj[k] = o.ret[k] - e.s / e.c; }
        const order = Int32Array.from({ length: o.n }, (_, k) => k).sort((a, b) => o.x[a] - o.x[b]);
        const dec = Array.from({ length: 10 }, (_, d) => order.subarray(Math.floor((d * o.n) / 10), Math.floor(((d + 1) * o.n) / 10)));
        const stats = dec.map((idx) => clustered(o, idx, adj));
        const line = stats.map((x) => pct(x.mean)).join(" ");
        const ext = (d: number) => {
          const st = stats[d];
          const halves = [0, 1].map((hh) => clustered(o, Array.from(dec[d]).filter((k) => (hh === 0 ? o.date[k] < SPLIT : o.date[k] >= SPLIT)), adj).mean);
          return `D${d + 1} ${pct(st.mean)} (t corr ${(st.mean / st.se / Math.sqrt(h)).toFixed(2)}; mitades ${halves.map(pct).join(" / ")})`;
        };
        console.log(`  [${g.name}] ${o.n} obs | deciles: ${line}`);
        console.log(`    ${ext(0)} | ${ext(9)}`);
      }
    }
  }
}

main();
