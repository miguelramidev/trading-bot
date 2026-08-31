import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

// Instancia de conexión a Neon
// Se usa neon-http para ambientes Serverless
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
