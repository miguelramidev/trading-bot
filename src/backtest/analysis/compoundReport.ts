// Informe de una corrida de run.ts pensado para interés compuesto: saldo final, frecuencia de
// operaciones (por día, semana, mes y año), evolución anual del saldo, caída máxima y cuánto
// dependió el resultado de los mejores trades.
//
// Correr: npx tsx src/backtest/analysis/compoundReport.ts <carpeta de la estrategia en data_dl/backtests/...>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Falta la carpeta de la corrida (…/<estrategia>_cost1)");

const parse = (file: string) => {
  const [head, ...rows] = readFileSync(join(dir, file), "utf8").trim().split("\n");
  const h = head.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [h[i], isNaN(Number(v)) ? v : Number(v)])) as Record<string, any>);
};
const trades = parse("trades.csv");
const equity = parse("equity.csv");

const first = Date.parse(equity[0].date);
const last = Date.parse(equity[equity.length - 1].date);
const days = (last - first) / 86_400_000 + 1;
const start = equity[0].equity - trades.filter((t) => t.exitTime.slice(0, 10) <= equity[0].date).reduce((s, t) => s + t.netPnl, 0);
const end = equity[equity.length - 1].equity;
const usd = (x: number) => `${x.toFixed(2)} USDT`;

console.log(`Período ${equity[0].date} → ${equity[equity.length - 1].date} (${days.toFixed(0)} días, ${(days / 365.25).toFixed(2)} años)`);
console.log(`Saldo: ${usd(start)} → ${usd(end)} (×${(end / start).toFixed(2)}, crecimiento anual compuesto ${((Math.pow(end / start, 365.25 / days) - 1) * 100).toFixed(1)} %)`);
console.log(`Operaciones: ${trades.length} | por día ${(trades.length / days).toFixed(2)} | por semana ${((trades.length / days) * 7).toFixed(1)} | por mes ${((trades.length / days) * 30.44).toFixed(1)} | por año ${((trades.length / days) * 365.25).toFixed(0)}`);
const wins = trades.filter((t) => t.netPnl > 0).length;
console.log(`Ganadas ${wins} (${((wins / trades.length) * 100).toFixed(1)} %) | duración media ${(trades.reduce((s, t) => s + (Date.parse(t.exitTime) - Date.parse(t.entryTime)), 0) / trades.length / 3_600_000).toFixed(0)} h`);

// Caída máxima y saldo mínimo.
let peak = -Infinity, peakDate = "", dd = 0, ddFrom = "", ddTo = "", min = Infinity, minDate = "";
for (const e of equity) {
  if (e.equity > peak) { peak = e.equity; peakDate = e.date; }
  const x = (peak - e.equity) / peak;
  if (x > dd) { dd = x; ddFrom = peakDate; ddTo = e.date; }
  if (e.equity < min) { min = e.equity; minDate = e.date; }
}
console.log(`Peor caída ${(dd * 100).toFixed(1)} % (${ddFrom} → ${ddTo}) | saldo mínimo ${usd(min)} el ${minDate}`);

// Evolución por año.
console.log("\nAño   | saldo inicial → final        | operaciones | variación");
const years = [...new Set(equity.map((e) => e.date.slice(0, 4)))];
let prevEnd = start;
for (const y of years) {
  const ye = equity.filter((e) => e.date.startsWith(y));
  const yEnd = ye[ye.length - 1].equity;
  const n = trades.filter((t) => t.entryTime.startsWith(y)).length;
  console.log(`${y}  | ${usd(prevEnd).padStart(14)} → ${usd(yEnd).padEnd(14)} | ${String(n).padStart(11)} | ${(((yEnd / prevEnd) - 1) * 100).toFixed(1)} %`);
  prevEnd = yEnd;
}

// Dependencia de los mejores trades (en % de retorno, porque el tamaño cambia con el saldo).
const rets = trades.map((t) => ({ t, r: t.netPnl / t.notional })).sort((a, b) => b.r - a.r);
console.log("\nMejores 3 trades (retorno sobre el nocional):", rets.slice(0, 3).map((x) => `${x.t.instrument} ${x.t.side} ${(x.r * 100).toFixed(0)} %`).join(", "));
const lev = trades.reduce((s, t) => s + t.leverage, 0) / trades.length;
// Saldo final sin el mejor trade: compuesto de los retornos sobre el saldo (netPnl / margen) menos ese.
const compound = (xs: number[]) => xs.reduce((g, r) => g * (1 + r), 1);
const all = trades.map((t) => (t.netPnl / t.notional) * t.leverage);
const withoutBest = [...all].sort((a, b) => b - a).slice(1);
console.log(`Saldo final aproximado SIN el mejor trade: ${usd(start * compound(withoutBest))} (con todos, por el mismo cálculo: ${usd(start * compound(all))}) | apalancamiento medio x${lev.toFixed(2)}`);
