import type { Hono } from "hono";
import type { Env } from "../config/env.ts";
import { createDatabase, type Database } from "../infrastructure/persistence/db.ts";
import { DrizzleTaskRepository } from "../infrastructure/persistence/drizzle-task-repository.ts";
import { createLogger, systemClock, uuidGenerator } from "../infrastructure/system.ts";
import { createApp } from "./app.ts";

/**
 * THE COMPOSITION ROOT — the single place where interfaces meet implementations.
 *
 * There is no DI container here on purpose. Explicit constructor wiring is
 * boring, greppable, and impossible to get "magically" wrong: to see what the
 * app is actually built from, you read this one function top to bottom.
 *
 * This is also the only file that knows about BOTH the application layer and
 * the infrastructure layer. Everything else sees one side or the other.
 */

export interface Composed {
  readonly app: Hono;
  shutdown(): Promise<void>;
}

export function compose(env: Env): Composed {
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
  const database: Database = createDatabase(env.DATABASE_URL);

  const app = createApp({
    deps: {
      tasks: new DrizzleTaskRepository(database.db),
      clock: systemClock(),
      ids: uuidGenerator(),
    },
    logger,
    corsOrigins: env.CORS_ORIGINS,
    checkReadiness: () => database.ping(),
  });

  return {
    app,
    shutdown: async () => {
      logger.info("Closing database pool");
      await database.close();
    },
  };
}
