import { ProblemSchema, TaskListSchema, TaskSchema } from "@kit/contracts";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "../../src/application/ports.ts";
import { createApp } from "../../src/http/app.ts";
import {
  InMemoryTaskRepository,
  fixedClock,
  sequentialIds,
} from "../fakes/in-memory-task-repository.ts";

/**
 * HTTP-layer tests with NO database and NO network listener.
 *
 * Hono apps are just `fetch` handlers, so the whole API is exercised in-process.
 * Every response is validated against the CONTRACT schema, which means these
 * tests fail if the implementation drifts from the published API — the same
 * check a consumer would perform.
 */

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let app: Hono;

beforeEach(() => {
  app = createApp({
    deps: {
      tasks: new InMemoryTaskRepository(),
      clock: fixedClock(),
      ids: sequentialIds(),
    },
    logger: silentLogger,
    corsOrigins: ["http://localhost:5173"],
    checkReadiness: () => Promise.resolve(),
  });
});

async function createTask(title: string): Promise<Response> {
  return app.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

describe("POST /api/tasks", () => {
  it("creates a task and returns a contract-valid 201", async () => {
    const response = await createTask("Write the ADR");

    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    const parsed = TaskSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.title).toBe("Write the ADR");
    expect(parsed.data.done).toBe(false);
  });

  it("returns an RFC 9457 problem for an empty title", async () => {
    const response = await createTask("");

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    const parsed = ProblemSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.status).toBe(400);
    expect(parsed.data.errors?.[0]?.pointer).toBe("/title");
  });

  it("returns a problem rather than crashing on malformed JSON", async () => {
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    expect(ProblemSchema.safeParse(await response.json()).success).toBe(true);
  });
});

describe("GET /api/tasks", () => {
  it("returns a contract-valid empty list", async () => {
    const response = await app.request("/api/tasks");

    expect(response.status).toBe(200);
    const parsed = TaskListSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ items: [], total: 0 });
  });

  it("rejects an out-of-range limit", async () => {
    const response = await app.request("/api/tasks?limit=101");

    expect(response.status).toBe(400);
    expect(ProblemSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("filters by done", async () => {
    await createTask("One");
    const created = await createTask("Two");
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });

    const response = await app.request("/api/tasks?done=true");
    const parsed = TaskListSchema.safeParse(await response.json());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.total).toBe(1);
    expect(parsed.data.items[0]?.title).toBe("Two");
  });
});

describe("GET /api/tasks/:taskId", () => {
  it("returns 404 with a problem document for an unknown id", async () => {
    const response = await app.request("/api/tasks/ffffffff-0000-4000-8000-000000000000");

    expect(response.status).toBe(404);
    const parsed = ProblemSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.status).toBe(404);
  });

  it("returns 400 when the id is not a UUID", async () => {
    const response = await app.request("/api/tasks/not-a-uuid");

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/tasks/:taskId", () => {
  it("returns 204 with no body", async () => {
    const created = await createTask("Temporary");
    const { id } = (await created.json()) as { id: string };

    const response = await app.request(`/api/tasks/${id}`, { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("returns 404 when deleting twice", async () => {
    const created = await createTask("Temporary");
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/tasks/${id}`, { method: "DELETE" });

    const response = await app.request(`/api/tasks/${id}`, { method: "DELETE" });

    expect(response.status).toBe(404);
  });
});

describe("health and fallbacks", () => {
  it("reports liveness", async () => {
    const response = await app.request("/health/live");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports 503 when readiness fails, without throwing", async () => {
    const unhealthy = createApp({
      deps: { tasks: new InMemoryTaskRepository(), clock: fixedClock(), ids: sequentialIds() },
      logger: silentLogger,
      corsOrigins: [],
      checkReadiness: () => Promise.reject(new Error("db down")),
    });

    const response = await unhealthy.request("/health/ready");

    expect(response.status).toBe(503);
  });

  it("returns a problem document for an unmatched route", async () => {
    const response = await app.request("/api/nope");

    expect(response.status).toBe(404);
    expect(ProblemSchema.safeParse(await response.json()).success).toBe(true);
  });
});
