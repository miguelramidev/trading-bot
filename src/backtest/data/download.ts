// Descarga de data.binance.vision (futures/um, datos públicos, sin claves): velas de 1h y
// funding mensuales de TODOS los perpetuos USDT elegibles, incluidos los deslistados (sin sesgo
// de supervivencia). Cada zip se verifica contra su .CHECKSUM (SHA-256). Es idempotente: lo que
// ya está descargado y verificado no se vuelve a pedir, así que se puede cortar y retomar.
//
// Correr: npx tsx src/backtest/data/download.ts [--from=2020-01] [--to=2026-09] [--only=BTCUSDT,ETHUSDT]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { isEligibleSymbol } from "./symbols.js";
import { KLINES_DIR, FUNDING_DIR, SYMBOLS_PATH, UM_DIR } from "./paths.js";

const BUCKET = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision";
const FILES = "https://data.binance.vision";
const CONCURRENCY = 16;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function fetchRetry(url: string, tries = 4): Promise<Response> {
  for (let k = 1; ; k++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || k >= tries) return res;
    } catch (e) {
      if (k >= tries) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** k));
  }
}

/** Listado S3 paginado: prefijos (carpetas) o keys bajo `prefix`. */
async function listS3(prefix: string, kind: "prefixes" | "keys"): Promise<string[]> {
  const out: string[] = [];
  let marker = "";
  for (;;) {
    const res = await fetchRetry(`${BUCKET}?delimiter=/&prefix=${encodeURIComponent(prefix)}&marker=${encodeURIComponent(marker)}`);
    if (!res.ok) throw new Error(`Listado S3 ${prefix}: HTTP ${res.status}`);
    const xml = await res.text();
    const re = kind === "prefixes" ? /<CommonPrefixes><Prefix>([^<]+)<\/Prefix><\/CommonPrefixes>/g : /<Key>([^<]+)<\/Key>/g;
    for (const m of xml.matchAll(re)) out.push(m[1]);
    const next = /<NextMarker>([^<]+)<\/NextMarker>/.exec(xml)?.[1];
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) return out;
    marker = next ?? out[out.length - 1];
  }
}

async function underlyingTypes(): Promise<Map<string, string>> {
  const res = await fetchRetry("https://fapi.binance.com/fapi/v1/exchangeInfo");
  if (!res.ok) throw new Error(`exchangeInfo: HTTP ${res.status}`);
  const info: any = await res.json();
  return new Map(info.symbols.map((s: any) => [s.symbol, s.underlyingType]));
}

/** "BTCUSDT-1h-2024-01.zip" → "2024-01". */
function monthOf(key: string): string | null {
  return /-(\d{4}-\d{2})\.zip$/.exec(key)?.[1] ?? null;
}

async function downloadVerified(key: string, dest: string): Promise<"ok" | "skip" | "missing"> {
  if (existsSync(dest)) return "skip";
  const [zipRes, sumRes] = await Promise.all([fetchRetry(`${FILES}/${key}`), fetchRetry(`${FILES}/${key}.CHECKSUM`)]);
  if (zipRes.status === 404) return "missing";
  if (!zipRes.ok) throw new Error(`${key}: HTTP ${zipRes.status}`);
  const buf = Buffer.from(await zipRes.arrayBuffer());
  if (sumRes.ok) {
    const expected = (await sumRes.text()).trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(buf).digest("hex");
    if (expected !== actual) throw new Error(`${key}: checksum no coincide`);
  }
  // Escritura atómica: un corte a mitad nunca deja un zip truncado que después se dé por bueno.
  writeFileSync(`${dest}.part`, buf);
  renameSync(`${dest}.part`, dest);
  return "ok";
}

async function pool<T>(items: T[], worker: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

async function main() {
  const from = arg("from") ?? "2020-01";
  const to = arg("to") ?? "2026-09";
  const only = arg("only")?.split(",");

  const types = await underlyingTypes();
  const all = (await listS3("data/futures/um/monthly/klines/", "prefixes")).map((p) => p.split("/").at(-2)!);
  const symbols = (only ?? all).filter((s) => isEligibleSymbol(s, types.get(s)));
  mkdirSync(UM_DIR, { recursive: true });
  writeFileSync(SYMBOLS_PATH, JSON.stringify({ listedAt: new Date().toISOString(), symbols }, null, 2));
  console.log(`${all.length} símbolos en el bucket, ${symbols.length} elegibles. Meses ${from} → ${to}.`);

  let ok = 0;
  let skipped = 0;
  const errors: string[] = [];
  let done = 0;
  await pool(symbols, async (symbol) => {
    const jobs: { key: string; dest: string }[] = [];
    for (const [prefix, dir] of [
      [`data/futures/um/monthly/klines/${symbol}/1h/`, join(KLINES_DIR, symbol)],
      [`data/futures/um/monthly/fundingRate/${symbol}/`, join(FUNDING_DIR, symbol)],
    ] as const) {
      const keys = (await listS3(prefix, "keys")).filter((k) => {
        const m = monthOf(k);
        return m !== null && m >= from && m <= to;
      });
      if (keys.length) mkdirSync(dir, { recursive: true });
      for (const key of keys) jobs.push({ key, dest: join(dir, key.split("/").at(-1)!) });
    }
    for (const j of jobs) {
      try {
        const r = await downloadVerified(j.key, j.dest);
        if (r === "ok") ok++;
        else if (r === "skip") skipped++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    done++;
    if (done % 25 === 0) console.log(`${done}/${symbols.length} símbolos (${ok} nuevos, ${skipped} ya estaban, ${errors.length} errores)`);
  });

  console.log(`Listo: ${ok} archivos nuevos, ${skipped} ya estaban, ${errors.length} errores.`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
