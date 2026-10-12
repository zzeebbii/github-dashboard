import { ProblemSchema, TaskListSchema, TaskSchema } from "@kit/contracts";
import { expect, test } from "@playwright/test";

/**
 * End-to-end journeys through the real stack: nginx → built SPA → Hono → Postgres.
 *
 * These tests target the HTTP CONTRACT and user-visible behaviour, never
 * implementation details. That is deliberate: they must survive replacing the
 * TypeScript backend with .NET or Go, and become the acceptance suite for the
 * replacement. See docs/guides/replacing-the-backend.md.
 *
 * Keep this suite small — critical journeys only. Breadth belongs in the faster
 * unit, component, and integration tiers.
 */

/** Each test uses a unique title so parallel runs cannot collide on shared state. */
function uniqueTitle(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 10)}`;
}

test.describe("Tasks", () => {
  test("a user can add, complete, and delete a task", async ({ page }) => {
    const title = uniqueTitle("E2E task");
    await page.goto("/");

    // --- add ---
    await page.getByLabel("New task").fill(title);
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText(title)).toBeVisible();

    // --- complete ---
    await page.getByRole("checkbox", { name: `Mark "${title}" as done` }).click();
    await expect(page.getByRole("checkbox", { name: `Mark "${title}" as not done` })).toBeChecked();

    // --- survives a reload, proving it was actually persisted ---
    await page.reload();
    await expect(page.getByRole("checkbox", { name: `Mark "${title}" as not done` })).toBeChecked();

    // --- delete ---
    await page.getByRole("button", { name: `Delete "${title}"` }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("the form rejects an empty title", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Add task" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("the API is reachable through the same origin and reports healthy", async ({ request }) => {
    // nginx proxies /api and /health to the backend, so the SPA needs no CORS
    // in production. Asserting it here catches a broken proxy config, which is
    // otherwise only discovered after deploy.
    const live = await request.get("/health/live");
    expect(live.status()).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });

    const ready = await request.get("/health/ready");
    expect(ready.status()).toBe(200);
  });

  test("the API rejects a contract-violating request with an RFC 9457 problem", async ({
    request,
  }) => {
    const response = await request.post("/api/tasks", { data: { title: "" } });

    expect(response.status()).toBe(400);
    // Validated against the CONTRACT schema, not a hand-written shape — so this
    // asserts the deployed API actually honours its published spec.
    const problem = ProblemSchema.parse(await response.json());
    expect(problem.status).toBe(400);
    expect(problem.errors?.[0]?.pointer).toBe("/title");
  });

  test("a created task conforms to the published contract", async ({ request }) => {
    const response = await request.post("/api/tasks", {
      data: { title: uniqueTitle("Contract check") },
    });

    expect(response.status()).toBe(201);
    // Throws if the running server drifts from artifacts/openapi.json.
    const task = TaskSchema.parse(await response.json());
    expect(task.done).toBe(false);

    const list = TaskListSchema.parse(await (await request.get("/api/tasks")).json());
    expect(list.items.some((item) => item.id === task.id)).toBe(true);

    await request.delete(`/api/tasks/${task.id}`);
  });
});
