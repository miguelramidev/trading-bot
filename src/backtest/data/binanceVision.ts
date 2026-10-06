// Cliente mínimo de data.binance.vision (datos públicos, sin claves): listado S3 paginado y
// descarga de zips verificados contra su .CHECKSUM (SHA-256), con escritura atómica.
import { createHash } from "node:crypto";
import { existsSync, writeFileSync, renameSync } from "node:fs";

const BUCKET = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision";
const FILES = "https://data.binance.vision";

export function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

export async function fetchRetry(url: string, tries = 4): Promise<Response> {
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
export async function listS3(prefix: string, kind: "prefixes" | "keys"): Promise<string[]> {
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

/** Baja `key` a `dest` si no existe. "missing" si Binance no tiene ese archivo (404). */
export async function downloadVerified(key: string, dest: string): Promise<"ok" | "skip" | "missing"> {
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

export async function pool<T>(items: T[], worker: (x: T) => Promise<void>, concurrency = 16) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}
