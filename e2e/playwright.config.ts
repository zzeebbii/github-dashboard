import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the PRODUCTION-LIKE Docker stack, not a dev server.
 *
 * That is the point: it validates the same images, the same nginx config, and
 * the same migration path that production uses. A suite that passes against
 * `vite dev` proves considerably less.
 *
 * Start the stack first: `pnpm stack:prod-like`, or let CI do it.
 */

const isCI = process.env["CI"] !== undefined;
const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // A test marked .only must never silently narrow a CI run.
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Note: `workers` is omitted rather than set to undefined — the repo enables
  // `exactOptionalPropertyTypes`, so an explicit undefined is a type error.
  ...(isCI ? { workers: 2 } : {}),
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    // The trace is the single most useful artifact for diagnosing a CI-only
    // failure — for a human or an agent.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
