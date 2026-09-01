import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { Resource } from "sst";

// Fallback para CLI tools (drizzle-kit)
const dbUrl = process.env.DATABASE_URL || Resource.DATABASE_URL.value;

// Instancia de conexión a Neon
// Se usa neon-http para ambientes Serverless
const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });
