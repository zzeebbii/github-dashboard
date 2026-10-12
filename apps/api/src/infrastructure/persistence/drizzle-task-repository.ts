import { count, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TaskFilter, TaskPage, TaskRepository } from "../../application/ports.ts";
import { Task, toTaskId, type TaskId } from "../../domain/task/task.ts";
import { tasks, type TaskRow } from "./schema.ts";

/**
 * The Drizzle adapter for the TaskRepository port.
 *
 * This is the ONLY file that knows tasks live in Postgres. Replacing Drizzle
 * (it is still 0.x — see ADR-0006) means rewriting this file and nothing else:
 * the port signature above it does not change, so no use case or test moves.
 *
 * Mapping between row and domain object happens here, at the boundary, so the
 * domain never carries persistence concerns.
 */
export class DrizzleTaskRepository implements TaskRepository {
  // Written as an explicit field rather than a constructor parameter property:
  // `erasableSyntaxOnly` bans parameter properties so Node can strip types
  // natively without a transform step. See docs/conventions/naming.md.
  private readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async findById(id: TaskId): Promise<Task | undefined> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toDomain(row);
  }

  async findMany(filter: TaskFilter): Promise<TaskPage> {
    const where = filter.done === undefined ? undefined : eq(tasks.done, filter.done);

    // Two queries: the page and the unpaged total. Kept explicit rather than
    // hidden behind a window function so the SQL is obvious when read back.
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(desc(tasks.createdAt))
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ value: count() }).from(tasks).where(where),
    ]);

    return {
      items: rows.map(toDomain),
      total: totals[0]?.value ?? 0,
    };
  }

  async save(task: Task): Promise<void> {
    const snapshot = task.toSnapshot();

    await this.db
      .insert(tasks)
      .values({
        id: snapshot.id,
        title: snapshot.title,
        done: snapshot.done,
        createdAt: snapshot.createdAt,
      })
      .onConflictDoUpdate({
        target: tasks.id,
        set: { title: snapshot.title, done: snapshot.done },
      });
  }

  async delete(id: TaskId): Promise<boolean> {
    const deleted = await this.db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
    return deleted.length > 0;
  }
}

/**
 * Rehydrates persisted state. `restore` rather than `create`, because rows were
 * validated when written; re-validating here would make historical rows
 * unloadable the moment a creation rule tightens.
 */
function toDomain(row: TaskRow): Task {
  return Task.restore({
    id: toTaskId(row.id),
    title: row.title,
    done: row.done,
    createdAt: row.createdAt,
  });
}
