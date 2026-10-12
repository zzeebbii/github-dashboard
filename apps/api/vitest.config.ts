import { defineConfig } from "vitest/config";

/**
 * Two projects, deliberately separated.
 *
 * `unit` is fast, hermetic, and runs on every save: domain, application, and HTTP
 * with in-memory fakes. `integration` spins up real PostgreSQL via Testcontainers
 * and is slower, so it runs after the unit suite in CI.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Containers take time to start; the default 5s is not enough.
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // One container per file would be wasteful; share a single worker.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/main.ts", // process entrypoint: exercised by E2E, not unit tests
        "src/http/composition.ts", // composition root: wiring only, no logic
        "src/infrastructure/persistence/schema.ts", // declarative table definitions
        "src/**/*.test.ts",
      ],
      // Per-layer thresholds. The pure layers have no excuse for gaps; adapters
      // are covered by integration tests and are held to a lower bar.
      // See docs/guides/testing.md and ADR-0008.
      thresholds: {
        "src/domain/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
        "src/application/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
        "src/http/**": { lines: 70, functions: 70, branches: 60, statements: 70 },
        "src/infrastructure/**": { lines: 70, functions: 70, branches: 60, statements: 70 },
      },
    },
  },
});
