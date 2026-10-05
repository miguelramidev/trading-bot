// Líneas base obligatorias (PROMPT_GUIDE.md, "Línea base primero"): toda estrategia tiene que
// superarlas para justificarse.
//   B0: BTC comprado y mantenido (perpetuo, sin apalancamiento, con funding).
//   B2: BTC solo cuando cierra sobre su SMA200, revisado los lunes (el filtro de la rotación).
//   B1: top 5 del universe point-in-time (por volumen), pesos iguales, rebalanceo semanal (lunes
//       00:00 UTC), con comisión taker + slippage sobre lo que se rota y funding diario.
// Se miden sobre retornos diarios, igual que las estrategias (Sharpe ×√365, MDD de la curva).
//
// Correr: npx tsx src/backtest/baselines.ts [--from=2021-01-01] [--to=2025-10-01] [--cost=1|2]
import { readFileSync } from "node:fs";
import { loadInstrumentData } from "./data/load.js";
import { DAY_MS } from "./data/candles.js";
import { UNIVERSE_PATH } from "./data/paths.js";
import { universeAt, type UniverseSnapshot } from "./universe.js";
import { maxDrawdownPct } from "./metrics.js";
import { HOLDOUT_START } from "./holdout.js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

interface Daily {
  close: Map<number, number>;
  /** Suma de funding de cada día (fracción del notional; positiva = paga el long). */
  funding: Map<number, number>;
}

function loadDaily(symbol: string): Map<string, Daily> {
  const out = new Map<string, Daily>();
  for (const inst of loadInstrumentData(symbol, 24, Infinity)) {
    const close = new Map<number, number>();
    for (let i = 0; i < inst.daily.length; i++) close.set(inst.daily.openTime[i], inst.daily.close[i]);
    const funding = new Map<number, number>();
    for (let k = 0; k < inst.funding.time.length; k++) {
      const day = Math.floor(inst.funding.time[k] / DAY_MS) * DAY_MS;
      funding.set(day, (funding.get(day) ?? 0) + inst.funding.rate[k]);
    }
    out.set(inst.id, { close, funding });
  }
  return out;
}

function stats(name: string, rets: number[]) {
  const eq: number[] = [1];
  for (const r of rets) eq.push(eq[eq.length - 1] * (1 + r));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1));
  const years = rets.length / 365;
  const cagr = (eq[eq.length - 1] ** (1 / years) - 1) * 100;
  console.log(
    `${name.padEnd(36)} CAGR ${cagr.toFixed(1)}% | MDD ${maxDrawdownPct(eq).toFixed(1)}% | Sharpe ${((m / sd) * Math.sqrt(365)).toFixed(2)} | días ${rets.length}`
  );
}

function main() {
  const from = Date.parse(`${arg("from") ?? "2021-01-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2025-10-01"}T00:00:00Z`);
  if (to > HOLDOUT_START && !process.argv.includes("--holdout")) throw new Error("--to pasa el inicio del holdout: pasá --holdout explícitamente.");
  const cost = Number(arg("cost") ?? 1);
  const tradeCost = (0.0005 + 0.0005) * cost; // taker + ~5 bps de slippage por lado rotado

  const universe: UniverseSnapshot[] = JSON.parse(readFileSync(UNIVERSE_PATH, "utf8")).snapshots;

  // B0: BTC.
  const btc = loadDaily("BTCUSDT").get("BTCUSDT")!;
  const b0: number[] = [];
  for (let d = from; d + DAY_MS < to; d += DAY_MS) {
    const c0 = btc.close.get(d);
    const c1 = btc.close.get(d + DAY_MS);
    if (c0 && c1) b0.push(c1 / c0 - 1 - (btc.funding.get(d + DAY_MS) ?? 0));
  }

  // B2: BTC solo con BTC > SMA200, revisado los lunes (mismo reloj y mismo filtro de mercado que
  // la rotación de la opción B). Si la rotación no le gana a esto, no aporta nada.
  const btcDays = [...btc.close.keys()].sort((a, b) => a - b);
  const sma200At = new Map<number, number>();
  for (let k = 199; k < btcDays.length; k++) {
    let sum = 0;
    for (let j = k - 199; j <= k; j++) sum += btc.close.get(btcDays[j])!;
    sma200At.set(btcDays[k], sum / 200);
  }
  const b2: number[] = [];
  let inMarket = false;
  for (let d = from; d + DAY_MS < to; d += DAY_MS) {
    let switchCost = 0;
    // La vela del domingo (d) cierra el lunes 00:00: se decide con ese cierre y su SMA200.
    if (new Date(d + DAY_MS).getUTCDay() === 1) {
      const c = btc.close.get(d);
      const ma = sma200At.get(d);
      const want = c !== undefined && ma !== undefined && c > ma;
      if (want !== inMarket) switchCost = tradeCost / 2; // una sola pata: entrar o salir
      inMarket = want;
    }
    const c0 = btc.close.get(d);
    const c1 = btc.close.get(d + DAY_MS);
    b2.push((inMarket && c0 && c1 ? c1 / c0 - 1 - (btc.funding.get(d + DAY_MS) ?? 0) : 0) - switchCost);
  }

  // B1: top 5 semanal.
  const cache = new Map<string, Daily>();
  const daily = (id: string) => {
    const symbol = id.split("~")[0];
    if (!cache.has(id)) for (const [k, v] of loadDaily(symbol)) cache.set(k, v);
    return cache.get(id);
  };
  const b1: number[] = [];
  let holdings: string[] = [];
  for (let d = from; d + DAY_MS < to; d += DAY_MS) {
    let turnover = 0;
    const isMonday = new Date(d).getUTCDay() === 1;
    if (isMonday || holdings.length === 0) {
      const next = (universeAt(universe, d)?.ranked ?? []).slice(0, 5);
      const changed = next.filter((id) => !holdings.includes(id)).length;
      turnover = holdings.length === 0 ? 1 : (2 * changed) / 5; // vender y comprar la parte rotada
      holdings = next;
    }
    // Retorno del día siguiente con los pesos decididos al inicio de d (sin look-ahead).
    let r = 0;
    let n = 0;
    for (const id of holdings) {
      const s = daily(id);
      const c0 = s?.close.get(d);
      const c1 = s?.close.get(d + DAY_MS);
      if (c0 && c1) {
        r += c1 / c0 - 1 - (s!.funding.get(d + DAY_MS) ?? 0);
        n++;
      } else if (c0) {
        r += -0.05; // dejó de cotizar: misma penalización que en el simulador
        n++;
      }
    }
    b1.push((n ? r / n : 0) - turnover * tradeCost);
  }

  console.log(`Período ${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)}, costos ×${cost}`);
  stats("B0 BTC comprado y mantenido", b0);
  stats("B1 top 5 por volumen, semanal", b1);
  stats("B2 BTC con filtro SMA200 semanal", b2);
}

main();
