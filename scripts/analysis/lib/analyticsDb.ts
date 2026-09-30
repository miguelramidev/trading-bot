// Conexión de solo lectura a la rama analítica de Neon.
// Usar SIEMPRE `ANALYTICS_DATABASE_URL`. NUNCA `DATABASE_URL` (esa es la
// base de producción). Nunca imprimir la connection string.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const rawUrl = process.env.ANALYTICS_DATABASE_URL;
if (!rawUrl) {
  throw new Error(
    "Falta ANALYTICS_DATABASE_URL en el entorno. Este script solo lee de la rama analítica de Neon."
  );
}
const url: string = rawUrl;

function scrub(text: string): string {
  return text.replaceAll(url, "[REDACTED]");
}

const sql = neon(url);

export async function queryAnalytics<T = any>(text: string, params: any[] = []): Promise<T[]> {
  try {
    return (await sql.query(text, params)) as T[];
  } catch (e: any) {
    throw new Error(scrub(String(e?.message ?? e)));
  }
}
