// Tendencia en BTC con apalancamiento y aportes mensuales (pedido del usuario, 2026-10-07).
//
// Reglas:
//   - Señal diaria al cierre (00:00 UTC): largo si el cierre de BTC está sobre su SMA de 200 días,
//     afuera (en USDT) si está debajo. Se ejecuta al open de la vela de 1h de las 00:00.
//   - Al abrir: nocional = saldo × apalancamiento. Cada mes (día 1, 00:00 UTC) se depositan
//     `deposit` USDT; si hay posición, se agranda hasta volver al apalancamiento sobre el saldo nuevo.
//     Entre medio el apalancamiento deriva con el precio (no se rebalancea).
//   - Margen cruzado: todo el saldo respalda la posición. Liquidación cuando el saldo cae al margen
//     de mantenimiento (mmr × nocional), revisada con el MÍNIMO de cada vela de 1h. Si se liquida, se
//     pierde todo el saldo de la cuenta; se sigue con el depósito siguiente.
//   - Funding real de BTC en cada evento: el largo paga rate × nocional (cobra si es negativo).
//   - Costos: comisión taker + slippage sobre el nocional operado en cada apertura, cierre o ampliación.
//
// Correr: npx tsx src/backtest/analysis/btcLeverageTrend.ts [--from=2020-08-01] [--to=2026-10-01] [--deposit=30]
import { loadInstruments, loadFunding } from "../data/store.js";
import { resample, HOUR_MS, DAY_MS, type Candle } from "../data/candles.js";
import { arg } from "../data/binanceVision.js";

export interface LevConfig {
  leverage: number; // 0 = mantener BTC spot (comprar cada aporte), sin señal
  deposit: number;
  initial: number;
  feeRate: number;
  slippage: number;
  mmr: number;
  smaDays: number;
}

export interface LevResult {
  finalEquity: number;
  deposited: number;
  liquidations: number;
  fundingPaid: number; // positivo = pagado
  fees: number;
  trades: number;
  /** Peor caída de la curva "por unidad" (retornos sin el efecto de los aportes). */
  maxDrawdownTwr: number;
  /** Saldo al cierre de cada año. */
  byYear: { year: number; equity: number; deposited: number }[];
  daysInMarket: number;
  totalDays: number;
}

/**
 * Simulación hora por hora. `h1` = velas de 1h de BTC ordenadas; `funding` = eventos (ms, tasa).
 * Las decisiones se toman a las 00:00 UTC con las velas diarias cerradas.
 */
export function simulateLevTrend(h1: Candle[], funding: { time: number; rate: number }[], cfg: LevConfig, from: number, to: number): LevResult {
  const daily = resample(h1, 24);
  const dayIdx = new Map(daily.map((d, k) => [d.openTime, k]));
  const sma = (k: number) => {
    if (k + 1 < cfg.smaDays) return NaN;
    let s = 0;
    for (let j = k - cfg.smaDays + 1; j <= k; j++) s += daily[j].close;
    return s / cfg.smaDays;
  };

  let cash = cfg.initial; // USDT libre (sin posición) o colateral (con posición)
  let qty = 0; // BTC en la posición
  let entry = 0; // precio medio de entrada
  let deposited = cfg.initial;
  let liquidations = 0, fundingPaid = 0, fees = 0, trades = 0, daysInMarket = 0, totalDays = 0;
  let fi = funding.findIndex((f) => f.time >= from);
  if (fi < 0) fi = funding.length;
  const byYear: LevResult["byYear"] = [];
  // Curva por unidad: crece con el retorno de cada hora, sin contar los aportes.
  let unit = 1, unitPeak = 1, maxDd = 0;
  let lastEquity = cfg.initial;

  const equityAt = (px: number) => (cfg.leverage === 0 ? cash + qty * px : cash + qty * (px - entry));
  const trade = (notional: number) => {
    const c = Math.abs(notional) * (cfg.feeRate + cfg.slippage);
    fees += c;
    cash -= c;
    trades++;
  };

  for (const bar of h1) {
    const H = bar.openTime;
    if (H < from || H >= to) continue;
    const dayStart = H % DAY_MS === 0;
    let flows = 0;

    if (dayStart) {
      totalDays++;
      const d = new Date(H);
      // Aporte mensual (día 1).
      if (d.getUTCDate() === 1 && H > from) {
        cash += cfg.deposit;
        deposited += cfg.deposit;
        flows += cfg.deposit;
        if (cfg.leverage === 0) {
          // Mantener: compra spot con todo el aporte.
          const q = (cfg.deposit * (1 - cfg.feeRate - cfg.slippage)) / bar.open;
          fees += cfg.deposit * (cfg.feeRate + cfg.slippage);
          cash -= cfg.deposit;
          qty += q;
          trades++;
        } else if (qty > 0) {
          // Agranda la posición para volver al apalancamiento sobre el saldo nuevo.
          const eq = equityAt(bar.open);
          const add = Math.max(0, eq * cfg.leverage - qty * bar.open);
          if (add > 0) {
            trade(add);
            const q = add / bar.open;
            entry = (entry * qty + bar.open * q) / (qty + q);
            qty += q;
          }
        }
      }
      if (H === Math.ceil(from / DAY_MS) * DAY_MS && cfg.leverage === 0 && qty === 0) {
        const q = (cash * (1 - cfg.feeRate - cfg.slippage)) / bar.open;
        fees += cash * (cfg.feeRate + cfg.slippage);
        qty = q;
        cash = 0;
        trades++;
      }
      // Señal de tendencia con la última vela diaria cerrada (la del día anterior).
      if (cfg.leverage > 0) {
        const k = dayIdx.get(H - DAY_MS);
        const above = k !== undefined && daily[k].close > sma(k);
        if (above && qty === 0 && cash > 0) {
          const notional = cash * cfg.leverage;
          trade(notional);
          qty = notional / bar.open;
          entry = bar.open;
        } else if (!above && qty > 0) {
          cash += qty * (bar.open - entry);
          trade(qty * bar.open);
          qty = 0;
        }
      }
      if (qty > 0 && cfg.leverage > 0) daysInMarket++;
    }

    // Funding de esta hora.
    while (fi < funding.length && funding[fi].time < H + HOUR_MS) {
      const f = funding[fi];
      if (f.time >= H && qty > 0 && cfg.leverage > 0) {
        const pay = qty * bar.open * f.rate;
        cash -= pay;
        fundingPaid += pay;
      }
      fi++;
    }

    // Liquidación con el mínimo de la vela (margen cruzado).
    if (qty > 0 && cfg.leverage > 0) {
      const liqPx = (qty * entry - cash) / (qty * (1 - cfg.mmr));
      if (bar.low <= liqPx) {
        liquidations++;
        cash = 0;
        qty = 0;
      }
    }

    // Curva por unidad (retorno de la hora sin aportes).
    const eqNow = equityAt(bar.close);
    const base = lastEquity + flows;
    if (base > 0) unit *= eqNow / base;
    lastEquity = eqNow;
    unitPeak = Math.max(unitPeak, unit);
    maxDd = Math.max(maxDd, 1 - unit / unitPeak);
    if (unit <= 0) unit = 1e-9;

    const next = H + HOUR_MS;
    if (next % DAY_MS === 0 && new Date(next).getUTCMonth() === 0 && new Date(next).getUTCDate() === 1) {
      byYear.push({ year: new Date(H).getUTCFullYear(), equity: eqNow, deposited });
    }
  }
  const lastBar = h1.filter((b) => b.openTime < to).at(-1)!;
  const finalEquity = equityAt(lastBar.close);
  byYear.push({ year: new Date(lastBar.openTime).getUTCFullYear(), equity: finalEquity, deposited });
  return { finalEquity, deposited, liquidations, fundingPaid, fees, trades, maxDrawdownTwr: maxDd, byYear, daysInMarket, totalDays };
}

function main() {
  const from = Date.parse(`${arg("from") ?? "2020-08-01"}T00:00:00Z`);
  const to = Date.parse(`${arg("to") ?? "2026-10-01"}T00:00:00Z`);
  const deposit = Number(arg("deposit") ?? 30);
  const h1 = loadInstruments("BTCUSDT")[0].candles1h;
  const funding = loadFunding("BTCUSDT").map((f) => ({ time: f.calcTime, rate: f.rate }));
  const base: Omit<LevConfig, "leverage"> = { deposit, initial: deposit, feeRate: 0.0005, slippage: 0.0002, mmr: 0.005, smaDays: 200 };
  const usd = (x: number) => `${x.toFixed(0).padStart(7)} USDT`;
  console.log(`BTC ${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)} · ${deposit} USDT iniciales + ${deposit} USDT por mes\n`);
  const runs = [0, 1, 2, 5, 10, 20].map((leverage) => ({ leverage, r: simulateLevTrend(h1, funding, { ...base, leverage }, from, to) }));
  console.log("Estrategia            | aportado   | saldo final | ganancia     | peor caída | liquidaciones | funding pagado | comisiones | días en el mercado");
  for (const { leverage, r } of runs) {
    const name = leverage === 0 ? "Mantener BTC (DCA)" : `Tendencia x${leverage}`;
    console.log(`${name.padEnd(21)} | ${usd(r.deposited)} | ${usd(r.finalEquity)} | ${(r.finalEquity - r.deposited >= 0 ? "+" : "") + (r.finalEquity - r.deposited).toFixed(0).padStart(6)} USDT | ${(r.maxDrawdownTwr * 100).toFixed(1).padStart(8)} % | ${String(r.liquidations).padStart(13)} | ${usd(r.fundingPaid)} | ${usd(r.fees)} | ${leverage === 0 ? "—" : `${((r.daysInMarket / r.totalDays) * 100).toFixed(0)} %`}`);
  }
  console.log("\nSaldo al cierre de cada año (aportado acumulado entre paréntesis):");
  const years = runs[0].r.byYear.map((y) => y.year);
  console.log("Año  | " + runs.map(({ leverage }) => (leverage === 0 ? "Mantener" : `x${leverage}`).padStart(10)).join(" | "));
  years.forEach((year, k) => {
    console.log(`${year} | ` + runs.map(({ r }) => (r.byYear[k] ? r.byYear[k].equity.toFixed(0) : "—").padStart(10)).join(" | ") + `   (aportado ${runs[0].r.byYear[k]?.deposited.toFixed(0)})`);
  });
}

if (process.argv[1]?.includes("btcLeverageTrend")) main();
