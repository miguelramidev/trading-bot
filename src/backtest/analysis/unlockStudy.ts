// Estudio de eventos UNLOCK, pre-registrado en docs/investigacion/2026-10-07-desbloqueos-y-presente.md.
// No opera ni elige parámetros. Mide el retorno ajustado por BTC alrededor de los desbloqueos de golpe
// ("cliff") y el resultado de la prueba pre-registrada: corto desde el cierre del día −8 al del +7,
// con funding y 0,3 % de costos.
//
// Cruce token → perpetuo por ticker (DefiLlama coins), validado por precio: el precio de DefiLlama
// en el día −8 tiene que coincidir ±15 % con el cierre del perpetuo (descarta tickers homónimos).
//
// Correr: npx tsx src/backtest/analysis/unlockStudy.ts (antes: data/downloadUnlocks.ts)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UNLOCKS_DIR, UNLOCK_SYMBOLS_PATH } from "../data/downloadUnlocks.js";
import { loadInstruments, loadFunding } from "../data/store.js";
import { resample, DAY_MS } from "../data/candles.js";
import { SYMBOLS_PATH } from "../data/paths.js";
import { fetchRetry } from "../data/binanceVision.js";

const FROM = Date.parse("2022-01-01T00:00:00Z");
const TO = Date.parse("2025-10-01T00:00:00Z");
const TEAM = new Set(["insiders", "privateSale"]);
const COST = 0.003;
const SPLIT = Date.parse("2024-01-01T00:00:00Z");

interface Event { slug: string; perp: string; factor: number; day: number; size: number; team: boolean; token: string }

/** Tokens desbloqueados acumulados (todas las categorías) al cierre del día anterior a `t`. */
function unlockedBefore(doc: any, t: number): number {
  let total = 0;
  for (const series of doc?.documentedData?.data ?? []) {
    let last = 0;
    for (const p of series.data ?? []) {
      if (p.timestamp * 1000 < t - DAY_MS) last = Number(p.unlocked) || 0;
      else break;
    }
    total += last;
  }
  return total;
}

async function main() {
  const symbols: Record<string, { token: string; symbol: string | null }> = JSON.parse(readFileSync(UNLOCK_SYMBOLS_PATH, "utf8"));
  const perps = new Set<string>(JSON.parse(readFileSync(SYMBOLS_PATH, "utf8")).symbols);

  // 1. Eventos de golpe, agregados por (proyecto, día).
  const events: Event[] = [];
  for (const [slug, info] of Object.entries(symbols)) {
    if (!info.symbol) continue;
    const prefixes: [string, number][] = [["", 1], ["1000", 1000], ["1000000", 1_000_000]];
    const hit = prefixes.find(([p]) => perps.has(`${p}${info.symbol}USDT`));
    if (!hit) continue;
    const file = join(UNLOCKS_DIR, "protocols", `${slug}.json`);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const byDay = new Map<number, { tokens: number; team: boolean }>();
    for (const e of doc?.metadata?.events ?? []) {
      if (e.unlockType !== "cliff") continue;
      const t = Number(e.timestamp) * 1000;
      if (!(t >= FROM && t < TO)) continue;
      const day = Math.floor(t / DAY_MS) * DAY_MS;
      const tokens = (e.noOfTokens ?? []).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
      if (!(tokens > 0)) continue;
      const cur = byDay.get(day) ?? { tokens: 0, team: false };
      cur.tokens += tokens;
      cur.team ||= TEAM.has(e.category);
      byDay.set(day, cur);
    }
    for (const [day, v] of byDay) {
      const before = unlockedBefore(doc, day);
      if (!(before > 0)) continue;
      events.push({ slug, perp: `${hit[0]}${info.symbol}USDT`, factor: hit[1], day, size: v.tokens / before, team: v.team, token: info.token });
    }
  }
  console.log(`${events.length} eventos de golpe 2022–2025 con perpetuo en Binance (antes de validar).`);

  // 2. Precios diarios del perpetuo y de BTC; funding.
  const dailyOf = new Map<string, Map<number, number>>();
  const fundingOf = new Map<string, { time: number; rate: number }[]>();
  const loadDaily = (perp: string) => {
    if (dailyOf.has(perp)) return dailyOf.get(perp)!;
    const m = new Map<number, number>();
    for (const inst of loadInstruments(perp)) for (const c of resample(inst.candles1h, 24)) m.set(c.openTime, c.close);
    dailyOf.set(perp, m);
    fundingOf.set(perp, loadFunding(perp).map((f) => ({ time: f.calcTime, rate: f.rate })));
    return m;
  };
  const btc = loadDaily("BTCUSDT");
  const closeAt = (m: Map<number, number>, day: number, k: number) => m.get(day + k * DAY_MS); // cierre de la vela del día day+k
  const fundingSum = (perp: string, a: number, b: number) => (fundingOf.get(perp) ?? []).filter((f) => f.time > a && f.time <= b).reduce((s, f) => s + f.rate, 0);

  // 3. Validación por precio (DefiLlama día −8 contra el cierre del perpetuo) y mediciones.
  const rows: { e: Event; w: Record<string, number>; trade: number }[] = [];
  let noData = 0, badPrice = 0;
  for (const e of events) {
    const m = loadDaily(e.perp);
    const keys = [-31, -8, -1, 0, 7, 30].map((k) => closeAt(m, e.day, k));
    const bk = [-31, -8, -1, 0, 7, 30].map((k) => closeAt(btc, e.day, k));
    if (keys.some((x) => !(x! > 0)) || bk.some((x) => !(x! > 0))) { noData++; continue; }
    const tRef = Math.floor((e.day - 7 * DAY_MS) / 1000);
    const res = await fetchRetry(`https://coins.llama.fi/prices/historical/${tRef}/${encodeURIComponent(e.token)}?searchWidth=12h`);
    const llama = res.ok ? Number((await res.json())?.coins?.[e.token]?.price) : NaN;
    const perpPx = keys[1]! / e.factor;
    if (!(llama > 0) || Math.abs(llama / perpPx - 1) > 0.15) { badPrice++; continue; }
    const [c31, c8, c1, c0, c7, c30] = keys as number[];
    const [b31, b8, b1, b0, b7, b30] = bk as number[];
    const adj = (ca: number, cb: number, ba: number, bb: number) => Math.log(cb / ca) - Math.log(bb / ba);
    const w = { "[−30,−1]": adj(c31, c1, b31, b1), "[−7,−1]": adj(c8, c1, b8, b1), "[0,+7]": adj(c1, c7, b1, b7), "[+1,+30]": adj(c0, c30, b0, b30) };
    // Corto en la moneda del cierre −8 al +7, con BTC como referencia (largo BTC): cobra el funding
    // de la moneda y paga el de BTC; 0,3 % de costos.
    const a = e.day - 7 * DAY_MS, b = e.day + 8 * DAY_MS;
    const trade = -adj(c8, c7, b8, b7) + fundingSum(e.perp, a, b) - fundingSum("BTCUSDT", a, b) - COST;
    rows.push({ e, w, trade });
  }
  console.log(`Validados: ${rows.length} | sin datos de precio en la ventana: ${noData} | descartados por precio distinto (ticker homónimo): ${badPrice}`);

  // 4. Resultados.
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
  const monthT = (xs: { e: Event; v: number }[]) => {
    const byM = new Map<number, number[]>();
    for (const { e, v } of xs) { const k = new Date(e.day).getUTCFullYear() * 12 + new Date(e.day).getUTCMonth(); byM.set(k, [...(byM.get(k) ?? []), v]); }
    const means = [...byM.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length);
    const m = means.reduce((s, x) => s + x, 0) / means.length;
    const sd = Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(means.length - 1, 1));
    return { mean: xs.reduce((s, x) => s + x.v, 0) / xs.length, t: m / (sd / Math.sqrt(means.length)), months: means.length };
  };
  const report = (title: string, sel: typeof rows) => {
    if (!sel.length) { console.log(`\n== ${title}: sin eventos`); return; }
    console.log(`\n== ${title} (N = ${sel.length})`);
    for (const k of Object.keys(sel[0].w)) console.log(`  ${k.padEnd(9)} retorno ajustado por BTC medio ${pct(sel.reduce((s, r) => s + r.w[k], 0) / sel.length)}`);
    const tr = monthT(sel.map((r) => ({ e: r.e, v: r.trade })));
    const halves = [0, 1].map((h) => sel.filter((r) => (h === 0 ? r.e.day < SPLIT : r.e.day >= SPLIT)));
    const exTop3 = [...sel].sort((a, b) => b.trade - a.trade).slice(3);
    console.log(`  CORTO −8 → +7 (con funding y costos): medio ${pct(tr.mean)} | t (por mes, ${tr.months} meses) ${tr.t.toFixed(2)} | mitades ${halves.map((h) => (h.length ? `${pct(h.reduce((s, r) => s + r.trade, 0) / h.length)} (N ${h.length})` : "—")).join(" / ")} | sin top 3 ${pct(exTop3.reduce((s, r) => s + r.trade, 0) / Math.max(exTop3.length, 1))} | ganadores ${((sel.filter((r) => r.trade > 0).length / sel.length) * 100).toFixed(0)} %`);
  };
  report("GRANDES (≥ 1 % de lo desbloqueado) — decide", rows.filter((r) => r.e.size >= 0.01));
  report("Grandes, equipo e inversores", rows.filter((r) => r.e.size >= 0.01 && r.e.team));
  report("Grandes, resto de categorías", rows.filter((r) => r.e.size >= 0.01 && !r.e.team));
  report("CHICOS (< 1 %)", rows.filter((r) => r.e.size < 0.01));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
