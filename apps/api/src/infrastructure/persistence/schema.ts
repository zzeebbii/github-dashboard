import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The database schema. This is infrastructure — the domain neither knows nor
 * cares that these columns exist. Migrations are generated from this file by
 * drizzle-kit and committed as plain SQL under apps/api/drizzle.
 */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    // Listing is ordered by createdAt DESC and optionally filtered by done.
    index("tasks_created_at_idx").on(table.createdAt.desc()),
    index("tasks_done_created_at_idx").on(table.done, table.createdAt.desc()),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
