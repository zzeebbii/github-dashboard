import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "../src/config/env.ts";

/**
 * Applies committed SQL migrations. Run as a dedicated one-shot container in
 * Compose and as a discrete step in CI/deploy — never implicitly on app start,
 * because N replicas booting simultaneously would race each other.
 */

const env = loadEnv();
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });

try {
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
