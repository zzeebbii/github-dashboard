import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Real PostgreSQL for integration tests.
 *
 * Not SQLite, and not a mocked repository: a repository adapter verified against
 * a different engine tests almost nothing that matters — dialect, constraints,
 * index behaviour, transactions, and timestamp handling all differ. Bugs in this
 * layer are exactly the ones a fake cannot surface.
 *
 * One container per test FILE, with truncation between tests. Re-running
 * migrations per test would dominate the runtime.
 */

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export interface TestDatabase {
  readonly db: NodePgDatabase;
  truncate(): Promise<void>;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("kit_test")
    .withUsername("kit")
    .withPassword("kit")
    // tmpfs keeps the data directory in memory: durability is irrelevant for a
    // container that is destroyed at the end of the file, and it is much faster.
    .withTmpFs({ "/var/lib/postgresql/data": "rw,noexec,nosuid,size=256m" })
    .start();

  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 5 });
  const db = drizzle(pool);

  // The SAME committed migrations production runs — so a broken migration fails
  // here rather than during a deploy.
  await migrate(db, { migrationsFolder });

  return {
    db,
    truncate: async () => {
      await pool.query("truncate table tasks restart identity cascade");
    },
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
