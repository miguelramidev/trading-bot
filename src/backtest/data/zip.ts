// Lector mínimo de ZIP para los archivos de data.binance.vision (un solo CSV por zip), sin
// dependencias externas.
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Descomprime el primer (y único) archivo del zip. Lanza "ZIP inválido" si no tiene esa forma. */
export function extractSingleFile(buf: Buffer): Buffer {
  // El EOCD está al final; puede tener un comentario de hasta 64 KB detrás.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP inválido: sin fin de directorio central");
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (centralOffset + 46 > buf.length || buf.readUInt32LE(centralOffset) !== CENTRAL_SIG) throw new Error("ZIP inválido: directorio central");

  const method = buf.readUInt16LE(centralOffset + 10);
  const compressedSize = buf.readUInt32LE(centralOffset + 20);
  const localOffset = buf.readUInt32LE(centralOffset + 42);
  if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error("ZIP inválido: header local");

  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`ZIP inválido: método de compresión ${method} no soportado`);
}
