import react from "@vitejs/plugin-react";
// Vitest 4 moved browser providers into their own packages; `provider` now takes
// a factory rather than the string 'playwright'.
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind on all interfaces so the container is reachable from the host.
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    projects: [
      {
        // Pure logic: hooks and functions with no DOM semantics worth verifying.
        // jsdom is fine here and much faster than a browser.
        // Inline projects inherit the root config (and its react() plugin) since Vitest 5.
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Component tests run in a REAL browser. jsdom passes on focus, layout,
        // and scroll behaviour that genuinely breaks in a browser, and that false
        // confidence is exactly where agent-written UI bugs hide. See ADR-0009.
        test: {
          name: "component",
          include: ["src/**/*.test.tsx", "tests/component/**/*.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/routes/router.tsx", "src/**/*.test.{ts,tsx}"],
      thresholds: {
        "src/ui/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
        "src/features/**": { lines: 80, functions: 80, branches: 70, statements: 80 },
        "src/application/**": { lines: 80, functions: 80, branches: 70, statements: 80 },
        "src/infrastructure/**": { lines: 80, functions: 80, branches: 70, statements: 80 },
      },
    },
  },
});
