import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads this to generate migrations from src/infrastructure/persistence/schema.ts.
 * Migrations are committed as plain SQL under ./drizzle and reviewed like code.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/persistence/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://kit:kit@localhost:5432/kit",
  },
});
