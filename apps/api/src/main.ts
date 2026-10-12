import { serve } from "@hono/node-server";
import { loadEnv } from "./config/env.ts";
import { compose } from "./http/composition.ts";

/**
 * Process entrypoint.
 *
 * Responsibilities are deliberately narrow: load config, compose the app, listen,
 * and shut down cleanly. Everything interesting happens in composition.ts.
 */

const env = loadEnv();
const composed = compose(env);

const server = serve({ fetch: composed.app.fetch, port: env.API_PORT }, (info) => {
  // oxlint-disable-next-line no-console -- reason: startup banner must reach stdout before any request-scoped logger exists
  console.log(`API listening on http://0.0.0.0:${info.port} (${env.NODE_ENV})`);
});

/**
 * Graceful shutdown. Without this, a rolling deploy drops in-flight requests and
 * leaves Postgres connections dangling until they time out.
 */
let shuttingDown = false;

async function terminate(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // oxlint-disable-next-line no-console -- reason: shutdown trace must survive logger teardown
  console.log(`Received ${signal}, shutting down`);

  server.close();
  await composed.shutdown();
  process.exit(0);
}

process.on("SIGTERM", () => void terminate("SIGTERM"));
process.on("SIGINT", () => void terminate("SIGINT"));
