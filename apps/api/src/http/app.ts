import { ProblemTypes } from "@kit/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Logger } from "../application/ports.ts";
import type { TaskDependencies } from "../application/task/task.usecases.ts";
import { internalProblem } from "./problem.ts";
import { createTaskRoutes } from "./task.routes.ts";

export interface AppOptions {
  readonly deps: TaskDependencies;
  readonly logger: Logger;
  readonly corsOrigins: readonly string[];
  /** Reports database reachability for the readiness probe. */
  readonly checkReadiness: () => Promise<void>;
}

/**
 * Builds the HTTP application.
 *
 * Takes its dependencies as arguments rather than importing them, so tests
 * construct a fully in-memory app with no database and no network.
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();

  app.use("*", requestId());
  app.use(
    "*",
    cors({
      origin: [...options.corsOrigins],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  // --- Health probes -------------------------------------------------------
  // Liveness answers "is the process up?"; readiness answers "can it serve
  // traffic?". Conflating them makes an orchestrator restart a healthy process
  // whenever the database blips.
  app.get("/health/live", (c) => c.json({ status: "ok" }, 200));

  app.get("/health/ready", async (c) => {
    try {
      await options.checkReadiness();
      return c.json({ status: "ok" }, 200);
    } catch (error) {
      options.logger.warn("Readiness check failed", { error: String(error) });
      return c.json({ status: "unavailable" }, 503);
    }
  });

  // --- API -----------------------------------------------------------------
  app.route("/", createTaskRoutes(options.deps));

  // --- Fallbacks -----------------------------------------------------------
  app.notFound((c) =>
    c.json(
      {
        type: ProblemTypes.notFound,
        title: "Resource not found",
        status: 404,
        detail: `No route matches ${c.req.method} ${c.req.path}.`,
        instance: c.req.path,
      },
      404,
    ),
  );

  app.onError((error, c) => {
    // Log the real cause; return a body that leaks nothing.
    options.logger.error("Unhandled error", {
      error: error instanceof Error ? error.stack : String(error),
      method: c.req.method,
      path: c.req.path,
      requestId: c.get("requestId"),
    });

    const problem = internalProblem(c.req.path);
    return c.json(problem.body, 500);
  });

  return app;
}
