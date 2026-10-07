// Calendario de desbloqueos de DefiLlama (gratis, sin clave), para la revisión UNLOCK
// (docs/investigacion/2026-10-07-desbloqueos-y-presente.md).
//   1. emissionsProtocolsList → lista de proyectos.
//   2. emissions/<slug> → eventos (fecha, tokens, categoría, cliff/lineal) y serie de desbloqueados.
//   3. coins.llama.fi → ticker de cada token a partir de su contrato ("chain:address").
// Guarda todo en data_dl/unlocks/. Idempotente: no vuelve a pedir lo que ya está.
//
// Correr: npx tsx src/backtest/data/downloadUnlocks.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UNLOCKS_DIR, UNLOCK_SYMBOLS_PATH } from "./paths.js";
import { fetchRetry, pool } from "./binanceVision.js";

const BASE = "https://defillama-datasets.llama.fi";

async function main() {
  mkdirSync(join(UNLOCKS_DIR, "protocols"), { recursive: true });
  const listRes = await fetchRetry(`${BASE}/emissionsProtocolsList`);
  if (!listRes.ok) throw new Error(`emissionsProtocolsList: HTTP ${listRes.status}`);
  const slugs: string[] = await listRes.json();
  console.log(`${slugs.length} proyectos en DefiLlama.`);

  let ok = 0, skip = 0;
  const errors: string[] = [];
  await pool(slugs, async (slug) => {
    const dest = join(UNLOCKS_DIR, "protocols", `${slug}.json`);
    if (existsSync(dest)) { skip++; return; }
    const res = await fetchRetry(`${BASE}/emissions/${encodeURIComponent(slug)}`);
    if (!res.ok) { errors.push(`${slug}: HTTP ${res.status}`); return; }
    writeFileSync(dest, await res.text());
    ok++;
  }, 8);
  console.log(`Proyectos: ${ok} nuevos, ${skip} ya estaban, ${errors.length} errores.`);

  // Ticker de cada token (por lotes de 50 contratos).
  const tokens = new Map<string, string>(); // slug → "chain:address"
  for (const slug of slugs) {
    const file = join(UNLOCKS_DIR, "protocols", `${slug}.json`);
    if (!existsSync(file)) continue;
    const token = JSON.parse(readFileSync(file, "utf8"))?.metadata?.token;
    if (typeof token === "string" && token.includes(":")) tokens.set(slug, token);
  }
  const unique = [...new Set(tokens.values())];
  const symbolOf = new Map<string, string>();
  for (let k = 0; k < unique.length; k += 50) {
    const batch = unique.slice(k, k + 50);
    const res = await fetchRetry(`https://coins.llama.fi/prices/current/${batch.map(encodeURIComponent).join(",")}`);
    if (!res.ok) { errors.push(`coins lote ${k}: HTTP ${res.status}`); continue; }
    const body: any = await res.json();
    for (const [key, v] of Object.entries<any>(body.coins ?? {})) if (v?.symbol) symbolOf.set(key, String(v.symbol).toUpperCase());
  }
  const out: Record<string, { token: string; symbol: string | null }> = {};
  for (const [slug, token] of tokens) out[slug] = { token, symbol: symbolOf.get(token) ?? null };
  writeFileSync(UNLOCK_SYMBOLS_PATH, JSON.stringify(out, null, 2));
  console.log(`Tickers: ${[...Object.values(out)].filter((x) => x.symbol).length} de ${tokens.size} proyectos con token.`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
