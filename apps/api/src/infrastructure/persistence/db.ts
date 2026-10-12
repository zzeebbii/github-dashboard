import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database connection lifecycle. Owned by infrastructure and handed to the
 * composition root; nothing else creates a pool.
 */

export interface Database {
  readonly db: NodePgDatabase;
  close(): Promise<void>;
  ping(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    // Bounded so a burst of requests cannot exhaust Postgres connections.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return {
    db: drizzle(pool),
    close: async () => {
      await pool.end();
    },
    ping: async () => {
      await pool.query("select 1");
    },
  };
}
