import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "../../db/schema";
import { env } from "../lib/env";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  if (database) return database;
  pool = new Pool({ connectionString: env.databaseUrl, max: 1 });
  attachDatabasePool(pool);
  database = drizzle(pool, { schema });
  return database;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
}
